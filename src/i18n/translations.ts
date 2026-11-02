import type { CivicCategory, ComplaintPriority, ComplaintStatus, UiLanguage } from '../types/civic.ts';

export const CATEGORY_LABELS: Record<CivicCategory, { en: string; hi: string }> = {
  'Water Supply': { en: 'Water Supply', hi: 'जलापूर्ति' },
  'Drainage and Sewage': { en: 'Drainage and Sewage', hi: 'सीवेज और जल निकासी' },
  'Road Damage': { en: 'Road Damage', hi: 'सड़क क्षति / गड्ढे' },
  'Garbage and Sanitation': { en: 'Garbage and Sanitation', hi: 'कचरा और स्वच्छता' },
  Streetlights: { en: 'Streetlights', hi: 'स्ट्रीटलाइट' },
  Electricity: { en: 'Electricity', hi: 'बिजली आपूर्ति' },
  'Parks and Horticulture': { en: 'Parks and Horticulture', hi: 'पार्क, उद्यान और वृक्ष' },
  'Encroachment and Illegal Construction': {
    en: 'Encroachment & Illegal Construction',
    hi: 'अतिक्रमण और अवैध निर्माण',
  },
  'Stray Animals and Cattle': {
    en: 'Stray Animals and Cattle',
    hi: 'आवारा पशु एवं गोवंश नियंत्रण',
  },
  'Public Health and Fogging': {
    en: 'Public Health & Mosquito Fogging',
    hi: 'जन-स्वास्थ्य एवं मच्छर फॉगिंग',
  },
  'Public Safety': { en: 'Public Safety', hi: 'जन सुरक्षा एवं खतरा निवारण' },
  'Other Civic Issues': { en: 'Other Civic Issues', hi: 'अन्य नागरिक समस्याएं' },
};

export const STATUS_LABELS: Record<ComplaintStatus, { en: string; hi: string }> = {
  Pending: { en: 'Pending', hi: 'लंबित' },
  'In Progress': { en: 'In Progress', hi: 'कार्य प्रगति पर' },
  Resolved: { en: 'Resolved', hi: 'समाधान पूर्ण' },
  Rejected: { en: 'Rejected', hi: 'अस्वीकृत' },
};

export const PRIORITY_LABELS: Record<ComplaintPriority, { en: string; hi: string }> = {
  Critical: { en: 'Critical (6h SLA)', hi: 'अति गंभीर (6 घंटे)' },
  High: { en: 'High (24h SLA)', hi: 'उच्च प्राथमिकता (24 घंटे)' },
  Medium: { en: 'Medium (72h SLA)', hi: 'मध्यम (72 घंटे)' },
  Low: { en: 'Low (120h SLA)', hi: 'सामान्य (120 घंटे)' },
};

export const UI_COPY: Record<
  UiLanguage,
  {
    brand: string;
    navHome: string;
    navSubmit: string;
    navTrack: string;
    navOfficer: string;
    ctaFileGrievance: string;
    prototypeNotice: string;
    heroHeadline: string;
    heroSubheadline: string;
    heroPrimaryBtn: string;
    heroSecondaryBtn: string;
    quickTrackPlaceholderId: string;
    quickTrackPlaceholderPin: string;
    quickTrackBtn: string;
    sectionHowTitle: string;
    sectionHowSub: string;
    sectionCasesTitle: string;
    sectionCasesSub: string;
    submitTitle: string;
    submitSub: string;
    trackTitle: string;
    trackSub: string;
    officerTitle: string;
    officerSub: string;
    footerDisclaimer: string;
  }
> = {
  en: {
    brand: 'CivicSaathi AI',
    navHome: 'Home',
    navSubmit: 'Submit Complaint',
    navTrack: 'Track Complaint',
    navOfficer: 'Officer Dashboard',
    ctaFileGrievance: 'File Grievance',
    prototypeNotice:
      'Prototype Environment · Fictional sample records are labeled · Routing uses configurable local ward rules rather than live government portals',
    heroHeadline: 'Your Voice. Your Language. Your Solution.',
    heroSubheadline:
      'Report neighborhood water leaks, road damage, sanitation issues, or safety hazards in Hindi, English, Hinglish, or regional Indian languages—by text or voice—with transparent ward routing and citizen-verified resolution.',
    heroPrimaryBtn: 'Submit a Citizen Grievance',
    heroSecondaryBtn: 'Track Existing Complaint',
    quickTrackPlaceholderId: 'Complaint ID (e.g. CS-BLR-2026-1002)',
    quickTrackPlaceholderPin: '4-Digit PIN',
    quickTrackBtn: 'Check Status',
    sectionHowTitle: 'Built for Multilingual Civic Accountability',
    sectionHowSub:
      'From regional voice transcription to citizen-confirmed repairs, every step is auditable and transparent.',
    sectionCasesTitle: 'Sample Municipal Case Records (Fictional Demo Data)',
    sectionCasesSub:
      'Inspect how grievances across Chandigarh, Haryana, Rajasthan, Delhi NCR, Maharashtra, and Pan-India municipal bodies are triaged, grouped, escalated, and verified.',
    submitTitle: 'Submit a Citizen Grievance',
    submitSub:
      'Write or speak in your preferred Indian language or Hinglish. Review the interpreted summary and department before registering.',
    trackTitle: 'Private Complaint Tracker & Resolution Verification',
    trackSub:
      'Enter your unique Complaint ID and 4-digit secret PIN to inspect status history, SLA deadlines, and verify completed repairs.',
    officerTitle: 'Municipal Officer & Nodal Admin Console',
    officerSub:
      'Role-restricted departmental queue, overdue SLA escalations, duplicate clusters, and resolution performance.',
    footerDisclaimer:
      'CivicSaathi AI is an AI-powered civic grievance prototype. Complaints submitted here are stored in this application database for demonstration and are not transmitted to external government agencies unless an official municipal integration is configured.',
  },
  hi: {
    brand: 'CivicSaathi AI',
    navHome: 'मुखपृष्ठ',
    navSubmit: 'शिकायत दर्ज करें',
    navTrack: 'स्थिति जानें',
    navOfficer: 'अधिकारी डैशबोर्ड',
    ctaFileGrievance: 'शिकायत दर्ज करें',
    prototypeNotice:
      'प्रोटोटाइप वातावरण · काल्पनिक डेमो शिकायतें स्पष्ट रूप से चिह्नित हैं · यह सीधे सरकारी पोर्टल से जुड़ा नहीं है',
    heroHeadline: 'Your Voice. Your Language. Your Solution.',
    heroSubheadline:
      'अपनी भाषा—हिन्दी, अंग्रेज़ी, हिंग्लिश या क्षेत्रीय भारतीय भाषाओं में लिखकर या बोलकर पानी, सड़क, बिजली, कचरा और जन-सुरक्षा से जुड़ी शिकायतें दर्ज करें, सही वार्ड विभाग तक पहुँचाएँ और समाधान की स्वयं पुष्टि करें।',
    heroPrimaryBtn: 'नई नागरिक शिकायत दर्ज करें',
    heroSecondaryBtn: 'शिकायत की स्थिति देखें',
    quickTrackPlaceholderId: 'शिकायत आईडी (उदा. CS-BLR-2026-1002)',
    quickTrackPlaceholderPin: '4-अंकीय पिन',
    quickTrackBtn: 'स्थिति देखें',
    sectionHowTitle: 'बहुभाषी नागरिक जवाबदेही के लिए निर्मित',
    sectionHowSub:
      'आवाज़ से शिकायत लिखने से लेकर समाधान के बाद नागरिक सत्यापन तक, हर चरण पारदर्शी और समयबद्ध है।',
    sectionCasesTitle: 'नमूना नगर निगम प्रकरण (काल्पनिक डेमो डेटा)',
    sectionCasesSub:
      'चंडीगढ़, हरियाणा, राजस्थान, दिल्ली एनसीआर, महाराष्ट्र और अखिल भारतीय नगर निकायों के वार्डों में एआई वर्गीकरण और समाधान सत्यापन देखें।',
    submitTitle: 'नागरिक शिकायत पंजीकरण',
    submitSub:
      'अपनी पसंदीदा भाषा या हिंग्लिश में समस्या लिखें या बोलें। शिकायत दर्ज करने से पहले एआई सारांश और प्रस्तावित विभाग की पुष्टि करें।',
    trackTitle: 'शिकायत ट्रैकिंग और समाधान सत्यापन',
    trackSub:
      'अपनी विशिष्ट शिकायत आईडी और 4-अंकीय गुप्त पिन दर्ज करके स्थिति इतिहास, समय-सीमा और मरम्मत फोटो की जाँच करें।',
    officerTitle: 'नगर निगम अधिकारी एवं नोडल नियंत्रण कक्ष',
    officerSub:
      'विभाग-आधारित सुरक्षित कार्यसूची, समय-सीमा उल्लंघन अलर्ट, समान शिकायत समूह और समाधान विश्लेषण।',
    footerDisclaimer:
      'CivicSaathi AI एक नागरिक शिकायत प्रबंधन प्रोटोटाइप है। यहाँ दर्ज शिकायतें डेमो डेटाबेस में सुरक्षित रहती हैं और बिना आधिकारिक एकीकरण के किसी वास्तविक सरकारी विभाग को स्वतः प्रेषित नहीं की जातीं।',
  },
};
