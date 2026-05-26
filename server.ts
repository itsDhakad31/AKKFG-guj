import "dotenv/config";
import express, { RequestHandler } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import http from "http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase, supabaseAdmin } from "./src/supabase";
import { sendApprovalEmail, sendDeclineEmail } from "./email";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const DEFAULT_PORT = 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'akkfg-secret-key-2026';
const DEFAULT_ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@akkfg.com').trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

let supabaseReady = false;
try {
  supabaseReady = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
  if (!supabaseReady) {
    console.warn('Warning: Supabase client keys missing; API routes may fail.');
  }
} catch (e) {
  console.warn('Warning: Supabase readiness check failed');
}



// Middleware - HOISTED FIRST
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Auth middleware - HOISTED
const authMiddleware: RequestHandler = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as any;
    (req as any).jwtPayload = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const isAdminMiddleware: RequestHandler = async (req, res, next) => {
  const payload = (req as any).jwtPayload;
  if (payload.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const STORAGE_BUCKET = 'documents';
const DOCUMENT_FIELDS = [
  'doc_photo',
  'doc_aadhar',
  'doc_pan',
  'doc_birth',
  'coaching_cert',
  'edu_qualification',
  'referee_cert'
] as const;
const MEDIA_TABLES = {
  photos: 'gallery_photos',
  videos: 'gallery_videos'
} as const;

const extractStoragePath = (value: string | null | undefined) => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const url = new URL(trimmed);
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${STORAGE_BUCKET}/`;

    if (url.pathname.includes(marker)) {
      return decodeURIComponent(url.pathname.split(marker)[1] || '').replace(/^\/+/, '');
    }

    if (url.pathname.includes(signedMarker)) {
      return decodeURIComponent(url.pathname.split(signedMarker)[1] || '').replace(/^\/+/, '');
    }
  } catch {
    return null;
  }

  return null;
};

const signStorageValue = async (value: string | null | undefined) => {
  const objectPath = extractStoragePath(value);
  if (!objectPath) return value || null;

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(objectPath, 60 * 60);

  if (error) {
    console.error(`Signed URL error for ${objectPath}:`, error);
    return value || null;
  }

  return data.signedUrl;
};

const attachSignedDocumentUrls = async <T extends Record<string, any>>(registration: T) => {
  const signedEntries = await Promise.all(
    DOCUMENT_FIELDS.map(async (field) => [field, await signStorageValue(registration[field])] as const)
  );

  return {
    ...registration,
    ...Object.fromEntries(signedEntries)
  };
};

const isMissingRelationError = (error: any) => error?.code === '42P01';

const createStorageObjectPath = (folder: string, fileName: string) => {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${folder}/${Date.now()}-${sanitized}`;
};

const attachSignedMediaUrls = async <T extends Record<string, any>>(
  items: T[],
  sourceField: keyof T,
  outputField: string
) => {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      [outputField]: await signStorageValue(item[sourceField] as string | null | undefined)
    }))
  );
};

const buildDownloadFilename = (label: string | undefined, objectPath: string) => {
  const rawName = (label && label.trim()) || path.basename(objectPath) || 'document';
  const extension = path.extname(objectPath);
  const hasExtension = path.extname(rawName);
  const withExtension = hasExtension ? rawName : `${rawName}${extension}`;
  return withExtension.replace(/["\r\n]/g, '_');
};

const isPasswordMatch = async (password: string, storedPassword: string) => {
  if (!storedPassword) return false;

  // Support proper bcrypt hashes and older plain-text test rows.
  if (storedPassword.startsWith('$2')) {
    return bcrypt.compare(password, storedPassword);
  }

  return password === storedPassword;
};

const findFreePort = (port: number): Promise<number> => {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.listen(port, () => {
      const assignedPort = (testServer.address() as any)?.port;
      testServer.close(() => resolve(assignedPort));
    });
    testServer.on('error', () => resolve(port + 1)); // Try next port on error
  });
};

// Helper
const generateUniqueID = async (role: string) => {
  const prefix = role === 'Coach' ? 'AKKFG-C' : role === 'Technical' ? 'AKKFG-T' : 'AKKFG-S';
  
  // Use robust query to fetch all unique_ids with prefix
  const { data, error } = await supabaseAdmin
    .from('registrations')
    .select('unique_id')
    .like('unique_id', `${prefix}-%`);
    
  if (error || !data || data.length === 0) {
    return `${prefix}-0001`;
  }
  
  let maxNum = 0;
  for (const row of data) {
    if (row.unique_id) {
      const parts = row.unique_id.split('-');
      const numPart = Number(parts[2]);
      if (!Number.isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }
  
  const count = maxNum + 1;
  return `${prefix}-${count.toString().padStart(4, '0')}`;
};

const virtualizeRegistration = (reg: any) => {
  if (!reg) return reg;
  if (reg.experience && reg.experience.startsWith('[Technical] ')) {
    return {
      ...reg,
      role: 'Technical',
      experience: reg.experience.slice('[Technical] '.length)
    };
  }
  return reg;
};

const virtualizeRegistrations = (regs: any[]) => {
  if (!Array.isArray(regs)) return [];
  return regs.map(virtualizeRegistration);
};


const getYearFromDateValue = (value: string | null | undefined) => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getFullYear();
  }

  const leadingYear = Number(trimmed.slice(0, 4));
  return Number.isNaN(leadingYear) ? null : leadingYear;
};

// API Routes - ALL /api/*
app.get('/api/ping', (req, res) => res.json({ message: 'pong' }));

app.get('/api/proxy-image', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).send('URL parameter is required');
  }
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (err) {
    console.error('Failed to proxy image:', err);
    res.status(500).send('Failed to proxy image');
  }
});

app.get('/api/healthz', (req, res) => {
  res.json({ ok: true, supabaseReady });
});

app.get('/api/site-stats', async (req, res) => {

  const currentYear = new Date().getFullYear();
    const [playersRes, coachesRes, citiesRes, eventsRes] = await Promise.all([
      supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }).eq('role', 'Student'),
      supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }).eq('role', 'Coach'),
      supabaseAdmin.from('registrations').select('address_city'),
      supabaseAdmin.from('events').select('date')
    ]);

  if (playersRes.error || coachesRes.error || citiesRes.error || eventsRes.error) {
    return res.status(500).json({
      error:
        playersRes.error?.message ||
        coachesRes.error?.message ||
        citiesRes.error?.message ||
        eventsRes.error?.message ||
        'Failed to load site stats'
    });
  }

  const districtsCovered = new Set(
    (citiesRes.data || [])
      .map((row) => row.address_city?.trim().toLowerCase())
      .filter(Boolean)
  ).size;

  const annualEvents = (eventsRes.data || []).filter((event) => getYearFromDateValue(event.date) === currentYear).length;

  res.json({
    registeredPlayers: playersRes.count ?? 0,
    activeCoaches: coachesRes.count ?? 0,
    districtsCovered,
    annualEvents
  });
});

app.get('/api/news', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('news').select('*').order('date', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data || []);
});

app.get('/api/events', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('events').select('*').order('date', { ascending: true });
  if (error) return res.status(500).json({ error });
  res.json(data || []);
});

app.post('/api/auth/register', async (req, res) => {
  const { name, password, role } = req.body;
  const email = normalizeEmail(req.body.email || '');
  try {
    const { data: existing } = await supabaseAdmin.from('users').select('*').eq('email', email).single();
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({ name, email, password: hashedPassword, role: role || 'Player' })
      .select()
      .single();
    if (error) throw error;
    const user = { id: data.id, name: data.name, email: data.email, role: data.role };
    const token = jwt.sign(user, JWT_SECRET);
    res.json({ user, token });
  } catch (error: any) {
    console.error('Register:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  console.log('LOGIN ATTEMPT:', req.body.email);
  const email = normalizeEmail(req.body.email || '');
  const { password } = req.body;
  try {
    if (email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) {
      const { data: adminUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .ilike('email', email)
        .maybeSingle();

      const payload = adminUser
        ? { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: 'Admin' }
        : { id: 'default-admin', name: 'Admin', email: DEFAULT_ADMIN_EMAIL, role: 'Admin' };

      const token = jwt.sign(payload, JWT_SECRET);
      return res.json({ user: payload, token });
    }

    const { data: user, error: queryError } = await supabaseAdmin.from('users').select('*').ilike('email', email).maybeSingle();
    if (queryError) {
      console.error('DB QUERY ERROR for email', email, ':', queryError);
      return res.status(500).json({ error: 'Database query failed', details: queryError.message });
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await isPasswordMatch(password, user.password);
    if (!valid) {
      if (user.role === 'Admin' && email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) {
        const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
        const token = jwt.sign(payload, JWT_SECRET);
        return res.json({ user: payload, token });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET);
    res.json({ user: payload, token });
  } catch (error: any) {
    console.error('LOGIN ERROR for', req.body.email, ':', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const { email, name } = req.body;
  const normalizedEmail = email?.trim().toLowerCase() || '';
  try {
    // 1. Check if user already exists
    let { data: user, error: queryError } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (queryError) {
      return res.status(500).json({ error: 'Database error', details: queryError.message });
    }

    // 2. If user doesn't exist, register them as Player
    if (!user) {
      const dummyPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          name: name || 'Google User',
          email: normalizedEmail,
          password: dummyPassword,
          role: 'Player'
        })
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ error: 'Failed to create user', details: insertError.message });
      }
      user = newUser;
    }

    // 3. Generate custom JWT token
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET);

    res.json({ user: payload, token });
  } catch (err: any) {
    console.error('Google Auth backend error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});


app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json((req as any).jwtPayload);
});

import multer from 'multer';
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    cb(null, true)
  }
});
const mediaUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

app.post('/api/register', upload.fields([
  { name: 'doc_photo', maxCount: 1 },
  { name: 'doc_aadhar', maxCount: 1 },
  { name: 'doc_pan', maxCount: 1 },
  { name: 'doc_birth', maxCount: 1 },
  { name: 'coaching_cert', maxCount: 1 },
  { name: 'edu_qualification', maxCount: 1 },
  { name: 'referee_cert', maxCount: 1 }
]), async (req, res) => {
  const data = { ...req.body };
  const isTechnical = data.role === 'Technical';
  if (isTechnical) {
    data.role = 'Coach';
    data.experience = `[Technical] ${data.experience || ''}`;
  }
  
  const urls: Record<string, string> = {};
  const multerFiles = req.files as { [fieldname: string]: Express.Multer.File[] } || {};
  const files = Object.values(multerFiles).flat();
  
  for (let file of files) {
    try {
      const fileName = `registrations/${Date.now()}-${file.originalname}`;
      const { error } = await supabaseAdmin.storage
        .from('documents')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });
      if (error) {
        console.error(`Upload error for ${file.fieldname}:`, error);
        continue;
      }
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('documents')
        .getPublicUrl(fileName);
      urls[file.fieldname] = publicUrlData.publicUrl;
    } catch (err) {
      console.error(`Error processing ${file.originalname}:`, err);
    }
  }
  
  Object.assign(data, urls);
  const roleForId = isTechnical ? 'Technical' : req.body.role;
  data.unique_id = await generateUniqueID(roleForId);

  const { data: result, error: insertError } = await supabaseAdmin.from('registrations').insert(data).select().single();
  if (insertError) return res.status(500).json({ error: insertError.message });
  res.json({ success: true, id: result.id, unique_id: result.unique_id, urls });
});

app.get('/api/registrations/me', authMiddleware, async (req, res) => {
  const payload = (req as any).jwtPayload;
  const { data, error } = await supabaseAdmin.from('registrations').select('*').eq('email', payload.email).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error });
  if (!data) return res.json(null);

  const signedData = await attachSignedDocumentUrls(data);
  res.json(virtualizeRegistration(signedData));
});

app.get('/api/admin/registrations', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('registrations').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  const registrations = await Promise.all((data || []).map(attachSignedDocumentUrls));
  res.json(virtualizeRegistrations(registrations));
});


app.get('/api/admin/photos', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from(MEDIA_TABLES.photos)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) return res.json([]);
    return res.status(500).json({ error: error.message });
  }

  const photos = await attachSignedMediaUrls(data || [], 'image_path', 'image');
  res.json(photos);
});

app.post('/api/admin/photos', authMiddleware, isAdminMiddleware, mediaUpload.single('file'), async (req, res) => {
  const file = req.file;
  const { title, category } = req.body;

  if (!file) return res.status(400).json({ error: 'Photo file is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'Photo title is required' });

  const objectPath = createStorageObjectPath('admin/photos', file.originalname);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data, error } = await supabaseAdmin
    .from(MEDIA_TABLES.photos)
    .insert({
      title: title.trim(),
      category: (category || 'Tournament').trim(),
      image_path: objectPath
    })
    .select('*')
    .single();

  if (error) {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([objectPath]);
    if (isMissingRelationError(error)) {
      return res.status(500).json({ error: 'Photo table is missing. Run supabase-media-schema.sql first.' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    photo: {
      ...data,
      image: await signStorageValue(data.image_path)
    }
  });
});

app.delete('/api/admin/photos/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from(MEDIA_TABLES.photos)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    if (isMissingRelationError(error)) return res.status(500).json({ error: 'Photo table is missing. Run supabase-media-schema.sql first.' });
    return res.status(404).json({ error: 'Photo not found' });
  }

  if (data.image_path) {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([data.image_path]);
  }

  const { error: deleteError } = await supabaseAdmin
    .from(MEDIA_TABLES.photos)
    .delete()
    .eq('id', id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });
  res.json({ success: true });
});

app.get('/api/admin/videos', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from(MEDIA_TABLES.videos)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) return res.json([]);
    return res.status(500).json({ error: error.message });
  }

  const videos = await attachSignedMediaUrls(data || [], 'video_path', 'url');
  res.json(videos);
});

app.post('/api/admin/videos', authMiddleware, isAdminMiddleware, mediaUpload.single('file'), async (req, res) => {
  const file = req.file;
  const { title } = req.body;

  if (!file) return res.status(400).json({ error: 'Video file is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'Video title is required' });

  const objectPath = createStorageObjectPath('admin/videos', file.originalname);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data, error } = await supabaseAdmin
    .from(MEDIA_TABLES.videos)
    .insert({
      title: title.trim(),
      video_path: objectPath
    })
    .select('*')
    .single();

  if (error) {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([objectPath]);
    if (isMissingRelationError(error)) {
      return res.status(500).json({ error: 'Video table is missing. Run supabase-media-schema.sql first.' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    video: {
      ...data,
      url: await signStorageValue(data.video_path)
    }
  });
});

app.delete('/api/admin/videos/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from(MEDIA_TABLES.videos)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    if (isMissingRelationError(error)) return res.status(500).json({ error: 'Video table is missing. Run supabase-media-schema.sql first.' });
    return res.status(404).json({ error: 'Video not found' });
  }

  if (data.video_path) {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([data.video_path]);
  }

  const { error: deleteError } = await supabaseAdmin
    .from(MEDIA_TABLES.videos)
    .delete()
    .eq('id', id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });
  res.json({ success: true });
});

app.get('/api/admin/documents/download', authMiddleware, isAdminMiddleware, async (req, res) => {
  const source = typeof req.query.source === 'string' ? req.query.source : '';
  const label = typeof req.query.label === 'string' ? req.query.label : '';
  const objectPath = extractStoragePath(source);

  if (!objectPath) {
    return res.status(400).json({ error: 'Invalid document source' });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(objectPath);

  if (error || !data) {
    return res.status(404).json({ error: error?.message || 'Document not found' });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const fileName = buildDownloadFilename(label, objectPath);

  res.setHeader('Content-Type', data.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', buffer.length.toString());
  res.send(buffer);
});

app.put('/api/admin/registrations/:id/status', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  const { data: reg } = await supabaseAdmin.from('registrations').select('*').eq('id', id).single();
  const isTech = reg.experience && reg.experience.startsWith('[Technical] ');
  const roleForId = isTech ? 'Technical' : reg.role;
  const unique_id = status === 'Approved' && !reg.unique_id ? await generateUniqueID(roleForId) : reg.unique_id;

  const { error } = await supabaseAdmin.from('registrations').update({ status, unique_id }).eq('id', id);
  if (error) return res.status(500).json({ error });

  if (status === 'Approved' && reg && reg.email) {
    const userRole = reg.role === 'Coach' ? 'Coach' : 'Player';
    await supabaseAdmin.from('users').update({ role: userRole }).eq('email', reg.email);
    
    // Asynchronously send approval email with dynamic credentials and dynamic ID card PDF attachment
    sendApprovalEmail(reg.email, reg.name, reg.role, unique_id, reg.dob, reg.gender, reg.kkfi_id, reg.nsrs_id, reg.doc_photo)
      .catch(err => console.error('Error sending registration approval email:', err));
  } else if (status === 'Rejected' && reg && reg.email) {
    // Asynchronously send decline email
    sendDeclineEmail(reg.email, reg.name, reg.role)
      .catch(err => console.error('Error sending registration decline email:', err));
  }

  res.json({ success: true, unique_id });
});

app.delete('/api/admin/registrations/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  const { error } = await supabaseAdmin.from('registrations').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

app.post('/api/admin/events', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { title, date, location, category, status } = req.body;
  const { data, error } = await supabaseAdmin.from('events').insert({ title, date, location, category, status: status || 'Upcoming' }).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.delete('/api/admin/events/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  const { error } = await supabaseAdmin.from('events').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

app.get('/api/admin/news', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('news').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data || []);
});

app.put('/api/admin/news/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  const { title, summary, date, image } = req.body;
  const updates = { title, summary, date, image };
  const { data, error } = await supabaseAdmin.from('news').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.post('/api/admin/news', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { title, summary, date, image } = req.body;
  const { data, error } = await supabaseAdmin.from('news').insert({ title, summary, date, image }).select().single();
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.delete('/api/admin/news/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  const { error } = await supabaseAdmin.from('news').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

app.get('/api/admin/stats', authMiddleware, isAdminMiddleware, async (req, res) => {
  const [usersRes, regsRes, pendingRes] = await Promise.all([
    supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'Pending')
  ]);
  const users = usersRes.count ?? 0;
  const registrations = regsRes.count ?? 0;
  const pending = pendingRes.count ?? 0;
  res.json({ users, registrations, pending });
});

// Vite dev server - AFTER API ROUTES
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    const requestedWsPort = Number(process.env.WS_PORT) || 24679;
    const wsPort = await findFreePort(requestedWsPort);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: wsPort } },
      appType: 'spa',
    });
    if (wsPort !== requestedWsPort) {
      console.log(`Vite HMR WebSocket port ${requestedWsPort} was busy, switched to ${wsPort}`);
    } else {
      console.log(`Vite HMR WebSocket port set to ${wsPort}`);
    }
    app.use(vite.middlewares);
    app.use('*', vite.middlewares);
    console.log('Vite dev middleware loaded');
  })();
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist/index.html'));
  });
}

// Graceful port finding and server start
const server = http.createServer(app);

(async () => {
  let port = Number(process.env.PORT) || DEFAULT_PORT;
  port = await findFreePort(port);
  
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log('API ready: http://localhost:${port}/api/ping');
  }).on('error', (err) => {
    if ((err as any).code === 'EADDRINUSE') {
      console.log('Port in use, trying next...');
    }
  });
  
  // Graceful shutdown
  const gracefulShutdown = (signal: string) => {
    console.log(`${signal} received: closing server`);
    server.close(() => {
      console.log('Server closed gracefully');
      process.exit(0);
    });
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
