export const CIVIC_CATEGORIES = [
  'Water Supply',
  'Drainage and Sewage',
  'Road Damage',
  'Garbage and Sanitation',
  'Streetlights',
  'Electricity',
  'Parks and Horticulture',
  'Encroachment and Illegal Construction',
  'Stray Animals and Cattle',
  'Public Health and Fogging',
  'Public Safety',
  'Other Civic Issues',
] as const;

export type CivicCategory = (typeof CIVIC_CATEGORIES)[number];

export const COMPLAINT_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const COMPLAINT_STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const SUPPORTED_INPUT_LANGUAGES = [
  { code: 'hi', labelEn: 'Hindi (हिन्दी)', labelHi: 'हिन्दी (Hindi)', samplePrompt: 'हमारी गली में पानी की पाइपलाइन फट गई है और सड़क पर पानी भर रहा है।' },
  { code: 'hinglish', labelEn: 'Hinglish (Hindi + English)', labelHi: 'हिंग्लिश (Hinglish)', samplePrompt: 'Main road par bada pothole hai near metro pillar, raat ko streetlight bhi band rehti hai.' },
  { code: 'en', labelEn: 'English', labelHi: 'अंग्रेज़ी (English)', samplePrompt: 'Overflowing garbage bins near Sector 4 market have not been cleared for four days.' },
  { code: 'mr', labelEn: 'Marathi (मराठी)', labelHi: 'मराठी (Marathi)', samplePrompt: 'कोथरूड शाळेजवळ गटाराचे झाकण उघडे आहे, लहान मुलांसाठी धोकादायक आहे.' },
  { code: 'pa', labelEn: 'Punjabi (ਪੰਜਾਬੀ)', labelHi: 'पंजाबी (Punjabi)', samplePrompt: 'ਸਾਡੀ ਗਲੀ ਵਿੱਚ ਸਟਰੀਟ ਲਾਈਟ ਪਿਛਲੇ ਹਫ਼ਤੇ ਤੋਂ ਖਰਾਬ ਹੈ।' },
  { code: 'ta', labelEn: 'Tamil (தமிழ்)', labelHi: 'तमिल (Tamil)', samplePrompt: 'எங்கள் தெருவில் குடிநீர் குழாய் உடைந்து தண்ணீர் வீணாகிறது.' },
  { code: 'bn', labelEn: 'Bengali (বাংলা)', labelHi: 'बंगाली (Bengali)', samplePrompt: 'রাস্তার ধারে খোলা ম্যানহোল রয়েছে, দ্রুত মেরামত প্রয়োজন।' },
  { code: 'te', labelEn: 'Telugu (తెలుగు)', labelHi: 'तेलुगु (Telugu)', samplePrompt: 'మా కాలనీలో డ్రైనేజీ పొంగిపొర్లుతోంది, దయచేసి వెంటనే పరిష్కరించండి.' },
] as const;

export type InputLanguageCode = (typeof SUPPORTED_INPUT_LANGUAGES)[number]['code'];
export type UiLanguage = 'en' | 'hi';

export interface DepartmentRecord {
  id: number;
  code: string;
  nameEn: string;
  nameHi: string;
  categoryMapped: string;
  slaHoursCritical: number;
  slaHoursHigh: number;
  slaHoursMedium: number;
  slaHoursLow: number;
  contactEmail: string;
  isActive: boolean;
}

export interface WardRecord {
  id: number;
  city: string;
  municipalBody: string;
  wardNumber: number;
  wardName: string;
  wardCode: string;
  verifiedLocalities: string;
  zoneName: string;
}

export interface DuplicateCandidate {
  trackingCode: string;
  category: string;
  locality: string;
  wardName: string;
  interpretedSummary: string;
  status: string;
  createdAt: string;
  similarityScore: number;
}

export interface TriageResult {
  detectedLanguage: string;
  interpretedSummaryEn: string;
  interpretedSummaryHi: string;
  category: CivicCategory;
  extractedLocationHint: string;
  priority: ComplaintPriority;
  priorityReason: string;
  recommendedDepartmentCode: string;
  recommendedDepartmentNameEn: string;
  recommendedDepartmentNameHi: string;
  requiresManualAssignment: boolean;
  slaHours: number;
  needsFollowUp: boolean;
  followUpQuestions: string[];
  classificationSource: 'ai' | 'rule_fallback';
  potentialDuplicates: DuplicateCandidate[];
  resolvedWard?: {
    wardCode: string;
    wardName: string;
    municipalBody: string;
    zoneName: string;
  } | null;
}

export interface EvidenceRecord {
  id: number;
  complaintId: number;
  stage: 'submission_before' | 'resolution_after' | 'reopen_proof' | string;
  mimeType: string;
  imageUrl: string;
  caption: string | null;
  uploadedByRole: string;
  createdAt: string;
}

export interface StatusHistoryRecord {
  id: number;
  complaintId: number;
  previousStatus: string | null;
  newStatus: string;
  actorRole: string;
  actorName: string;
  comment: string;
  createdAt: string;
}

export interface NotificationRecord {
  id: number;
  complaintId: number;
  channel: string;
  recipientMasked: string;
  subject: string;
  message: string;
  deliveryState: string;
  createdAt: string;
}

export interface FeedbackRecord {
  id: number;
  complaintId: number;
  outcome: 'confirmed' | 'reopened' | string;
  rating: number | null;
  citizenComment: string;
  createdAt: string;
}

export interface AssignmentRecord {
  id: number;
  complaintId: number;
  departmentCode: string;
  assignedToUid: string | null;
  assignedToName: string;
  assignedByName: string;
  routingType: string;
  notes: string | null;
  createdAt: string;
}

export interface ComplaintDetail {
  id: number;
  trackingCode: string;
  language: string;
  rawDescription: string;
  interpretedSummary: string;
  category: string;
  priority: string;
  priorityReason: string;
  classificationSource: string;
  city: string;
  wardCode: string;
  wardName: string;
  locality: string;
  landmark: string | null;
  citizenName: string;
  citizenPhoneMasked?: string | null;
  citizenPhone?: string | null;
  citizenEmail?: string | null;
  departmentCode: string;
  departmentName: string;
  requiresManualAssignment: boolean;
  assignedOfficerUid: string | null;
  assignedOfficerName: string | null;
  duplicateOfTrackingCode: string | null;
  duplicateClusterCount?: number;
  linkedDuplicateCodes?: string[];
  status: string;
  slaDeadline: string;
  isEscalated: boolean;
  escalatedAt: string | null;
  resolutionVerifiedStatus: string;
  isSampleDemo: boolean;
  createdAt: string;
  updatedAt: string;
  history: StatusHistoryRecord[];
  evidence: EvidenceRecord[];
  notifications: NotificationRecord[];
  feedback: FeedbackRecord[];
  assignments?: AssignmentRecord[];
}

export interface PublicDemoCard {
  trackingCode: string;
  demoPin: string;
  city: string;
  wardName: string;
  locality: string;
  language: string;
  rawDescription: string;
  interpretedSummary: string;
  category: string;
  priority: string;
  departmentName: string;
  status: string;
  isEscalated: boolean;
  requiresManualAssignment: boolean;
  duplicateOfTrackingCode: string | null;
  resolutionVerifiedStatus: string;
  beforeImageUrl?: string | null;
  afterImageUrl?: string | null;
  createdAt: string;
}

export interface PublicOverviewResponse {
  stats: {
    totalComplaints: number;
    resolvedCount: number;
    inProgressCount: number;
    pendingCount: number;
    avgSlaCompliancePct: number;
    citiesCovered: number;
  };
  departments: DepartmentRecord[];
  wards: WardRecord[];
  sampleComplaints: PublicDemoCard[];
}

export interface OfficerProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'department_officer' | string;
  departmentCode: string | null;
  cityScope: string | null;
  canSimulateRoles: boolean;
}

export interface OfficerDashboardResponse {
  profile: OfficerProfile;
  kpis: {
    total: number;
    pending: number;
    inProgress: number;
    resolved: number;
    rejected: number;
    overdue: number;
    manualQueue: number;
  };
  byCategory: { category: string; total: number; resolved: number }[];
  byCity: { city: string; total: number; overdue: number; resolved: number }[];
  complaints: ComplaintDetail[];
  officers: OfficerProfile[];
  departments: DepartmentRecord[];
  wards: WardRecord[];
}
