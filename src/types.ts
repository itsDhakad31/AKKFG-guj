export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  date: string;
  image: string;
}

export interface EventItem {
  id: number;
  title: string;
  date: string;
  location: string;
  category: string;
  status: 'Upcoming' | 'Ongoing' | 'Completed';
}

export interface SiteStats {
  registeredPlayers: number;
  activeCoaches: number;
  districtsCovered: number;
  annualEvents: number;
}

export interface RegistrationData {
  unique_id?: string;
  name: string;
  dob: string;
  address_city: string;
  address_country: string;
  gender: string;
  email: string;
  mobile: string;
  experience: string;
  role: 'Coach' | 'Student' | 'Technical';
  status?: string;
  // Docs - backend URLs
  doc_photo?: string;
  doc_aadhar?: string;
  doc_pan?: string;
  doc_birth?: string;
  // Student specific
  level_passing?: string;
  year_passing?: string;
  coaching_cert?: string;
  edu_qualification?: string;
  referee_cert?: string;
  kkfi_id?: string;
  nsrs_id?: string;
}

// Frontend form state
export interface RegistrationFormData extends Omit<RegistrationData, 'doc_photo' | 'doc_aadhar' | 'doc_pan' | 'doc_birth'> {
  doc_photo?: File | null;
  doc_aadhar?: File | null;
  doc_pan?: File | null;
  doc_birth?: File | null;
}
