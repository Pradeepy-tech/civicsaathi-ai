import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  complaintAssignments,
  complaints,
  departments,
  notifications,
  resolutionFeedback,
  statusHistory,
  uploadedEvidence,
  users,
  wards,
} from './schema.ts';
import { DEMO_IMAGE_PATHS, INITIAL_DEPARTMENTS, INITIAL_WARDS } from './seedData.ts';
import {
  getTrackingPrefixForCity,
  matchVerifiedLocalityToWard,
} from '../data/municipalDirectory.ts';
import {
  generatePinCode,
  generateTrackingCode,
  hashAccessPin,
  maskEmail,
  maskPhone,
  verifyAccessPin,
} from '../server/security.ts';
import { rankDuplicateCandidates } from '../server/pythonMlBridge.ts';
import type {
  CivicCategory,
  ComplaintDetail,
  ComplaintPriority,
  ComplaintStatus,
  DepartmentRecord,
  DuplicateCandidate,
  OfficerDashboardResponse,
  OfficerProfile,
  PublicDemoCard,
  PublicOverviewResponse,
  WardRecord,
} from '../types/civic.ts';

let seedPromise: Promise<void> | null = null;
const OWNER_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'pradeepy23050@gmail.com').toLowerCase();

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3600 * 1000);
}

function computeSlaHours(dept: DepartmentRecord | undefined, priority: ComplaintPriority): number {
  if (!dept) {
    if (priority === 'Critical') return 6;
    if (priority === 'High') return 24;
    if (priority === 'Medium') return 72;
    return 120;
  }
  if (priority === 'Critical') return dept.slaHoursCritical;
  if (priority === 'High') return dept.slaHoursHigh;
  if (priority === 'Medium') return dept.slaHoursMedium;
  return dept.slaHoursLow;
}

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) {
    return seedPromise;
  }
  seedPromise = (async () => {
    try {
      await db
        .insert(departments)
        .values(INITIAL_DEPARTMENTS)
        .onConflictDoUpdate({
          target: departments.code,
          set: {
            nameEn: sql`excluded.name_en`,
            nameHi: sql`excluded.name_hi`,
            categoryMapped: sql`excluded.category_mapped`,
            slaHoursCritical: sql`excluded.sla_hours_critical`,
            slaHoursHigh: sql`excluded.sla_hours_high`,
            slaHoursMedium: sql`excluded.sla_hours_medium`,
            slaHoursLow: sql`excluded.sla_hours_low`,
            contactEmail: sql`excluded.contact_email`,
          },
        });

      await db
        .insert(wards)
        .values(INITIAL_WARDS)
        .onConflictDoUpdate({
          target: wards.wardCode,
          set: {
            city: sql`excluded.city`,
            municipalBody: sql`excluded.municipal_body`,
            wardNumber: sql`excluded.ward_number`,
            wardName: sql`excluded.ward_name`,
            verifiedLocalities: sql`excluded.verified_localities`,
            zoneName: sql`excluded.zone_name`,
          },
        });

      const existingComplaints = await db
        .select({ trackingCode: complaints.trackingCode })
        .from(complaints);
      const existingCodes = new Set(existingComplaints.map((c) => c.trackingCode));
      await seedSampleComplaints(existingCodes);
    } catch (error) {
      seedPromise = null;
      console.error('Database initialization failed:', error);
      throw new Error('Failed to initialize municipal database records.', { cause: error });
    }
  })();

  return seedPromise;
}

async function seedSampleComplaints(existingCodes: Set<string>): Promise<void> {
  const now = Date.now();
  const sampleItems = [
    {
      trackingCode: 'CS-DEL-2026-1001',
      pin: '1122',
      language: 'hinglish',
      rawDescription:
        'Karol Bagh Ajmal Khan Road ke paas main paani ki pipeline phat gayi hai, subah se hazaron litre saaf paani sadak par beh raha hai aur gharo mein supply band hai.',
      interpretedSummary:
        'Major municipal water supply pipeline burst near Ajmal Khan Road, Karol Bagh causing street flooding and residential water outage since morning.',
      category: 'Water Supply',
      priority: 'Critical',
      priorityReason:
        'Infrastructure Rule #3: Major water pipeline burst causing active street flooding and supply loss.',
      classificationSource: 'ai',
      city: 'New Delhi',
      wardCode: 'DEL-W78',
      wardName: 'Karol Bagh Central (Ward 78)',
      locality: 'Ajmal Khan Road',
      landmark: 'Near Metro Gate 2, Karol Bagh Market',
      citizenName: 'Rajesh Sharma (Fictional Sample)',
      citizenPhone: '+91-98100-01122',
      citizenEmail: 'rajesh.sample@example.org',
      departmentCode: 'WATER',
      departmentName: 'Water Supply & Jal Board Department',
      requiresManualAssignment: false,
      assignedOfficerName: 'Er.Vikram Nair (DJB Ward Engineer)',
      duplicateOfTrackingCode: null,
      status: 'Pending',
      createdAt: new Date(now - 9 * 3600 * 1000),
      slaDeadline: new Date(now - 3 * 3600 * 1000), // Overdue -> will demonstrate Escalation!
      isEscalated: true,
      escalatedAt: new Date(now - 2.5 * 3600 * 1000),
      resolutionVerifiedStatus: 'unverified',
      beforeImage: DEMO_IMAGE_PATHS.waterLeakBefore,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Rajesh Sharma (Citizen)',
          comment: 'Grievance registered in Hinglish with photo evidence; routed to Water Supply Department.',
          createdAt: new Date(now - 9 * 3600 * 1000),
        },
        {
          previousStatus: 'Pending',
          newStatus: 'Pending',
          actorRole: 'system',
          actorName: 'SLA Escalation Monitor',
          comment:
            'Automatic Escalation: Critical 6-hour response SLA exceeded. Alert dispatched to Zonal Water Engineer.',
          createdAt: new Date(now - 2.5 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-BLR-2026-1002',
      pin: '2233',
      language: 'en',
      rawDescription:
        'Deep rainwater-filled pothole on HAL 2nd Stage main lane near Indiranagar 100ft Road curb causing two-wheelers to skid.',
      interpretedSummary:
        'Deep waterlogged asphalt pothole beside footpath curb on HAL 2nd Stage lane, Indiranagar posing skid hazard for two-wheelers.',
      category: 'Road Damage',
      priority: 'High',
      priorityReason: 'Urgency Rule: Deep road hazard on active residential commuter lane.',
      classificationSource: 'ai',
      city: 'Bengaluru',
      wardCode: 'BLR-W80',
      wardName: 'Hoysala Nagar - Indiranagar (Ward 80)',
      locality: 'HAL 2nd Stage',
      landmark: '50m from 100ft Road Junction',
      citizenName: 'Ananya Rao (Fictional Sample)',
      citizenPhone: '+91-98450-02233',
      citizenEmail: 'ananya.sample@example.org',
      departmentCode: 'ROADS',
      departmentName: 'Roads Engineering & PWD Division',
      requiresManualAssignment: false,
      assignedOfficerName: 'Er. Karthik Gowda (BBMP Roads)',
      duplicateOfTrackingCode: null,
      status: 'Resolved',
      createdAt: new Date(now - 42 * 3600 * 1000),
      slaDeadline: new Date(now - 6 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: DEMO_IMAGE_PATHS.roadBefore,
      afterImage: DEMO_IMAGE_PATHS.roadAfter,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Ananya Rao (Citizen)',
          comment: 'Grievance submitted with before-photo of damaged road surface.',
          createdAt: new Date(now - 42 * 3600 * 1000),
        },
        {
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          actorRole: 'officer',
          actorName: 'Er. Karthik Gowda (BBMP Roads)',
          comment: 'Hot-mix asphalt patching unit scheduled for Ward 80 morning maintenance batch.',
          createdAt: new Date(now - 26 * 3600 * 1000),
        },
        {
          previousStatus: 'In Progress',
          newStatus: 'Resolved',
          actorRole: 'officer',
          actorName: 'Er. Karthik Gowda (BBMP Roads)',
          comment:
            'Pothole milled, leveled, and resurfaced with compacted hot-mix asphalt. After-photo uploaded for citizen verification.',
          createdAt: new Date(now - 8 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-PUN-2026-1003',
      pin: '3344',
      language: 'mr',
      rawDescription:
        'कोथरूड डेपो जवळ मुख्य रस्त्यावर गटाराचे झाकण तुटलेले व उघडे आहे. शाळेच्या बस आणि पादचाऱ्यांसाठी अत्यंत धोकादायक परिस्थिती आहे.',
      interpretedSummary:
        'Broken and uncovered sewage manhole cover on main road near Kothrud Depot creating immediate hazard for school commuters and pedestrians.',
      category: 'Drainage and Sewage',
      priority: 'Critical',
      priorityReason:
        'Safety Rule #1: Open or uncovered manhole poses immediate pedestrian/vehicle fall hazard.',
      classificationSource: 'ai',
      city: 'Pune',
      wardCode: 'PUN-W10',
      wardName: 'Kothrud Bavdhan (Ward 10)',
      locality: 'Kothrud Depot',
      landmark: 'Opposite Municipal Primary School Gate',
      citizenName: 'Sagar Kulkarni (Fictional Sample)',
      citizenPhone: '+91-98220-03344',
      citizenEmail: 'sagar.sample@example.org',
      departmentCode: 'DRAINAGE',
      departmentName: 'Stormwater Drainage & Sewerage Wing',
      requiresManualAssignment: false,
      assignedOfficerName: 'Er. Snehal Deshmukh (PMC Drainage)',
      duplicateOfTrackingCode: null,
      status: 'In Progress',
      createdAt: new Date(now - 3 * 3600 * 1000),
      slaDeadline: new Date(now + 3 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Sagar Kulkarni (Citizen)',
          comment: 'Submitted in Marathi; flagged Critical under Safety Rule #1.',
          createdAt: new Date(now - 3 * 3600 * 1000),
        },
        {
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          actorRole: 'officer',
          actorName: 'Er. Snehal Deshmukh (PMC Drainage)',
          comment:
            'Safety barricades placed at spot within 45 minutes; heavy-duty RCC manhole slab replacement crew dispatched.',
          createdAt: new Date(now - 1.5 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-DEL-2026-1004',
      pin: '4455',
      language: 'hi',
      rawDescription:
        'अजमल खान रोड करोल बाग में सुबह से पानी की मुख्य पाइपलाइन टूटी हुई है और घरों में बिल्कुल पानी नहीं आ रहा है। कृपया जल्द ठीक करें।',
      interpretedSummary:
        'Main water supply pipeline ruptured at Ajmal Khan Road, Karol Bagh resulting in zero household water supply since morning (Grouped with CS-DEL-2026-1001).',
      category: 'Water Supply',
      priority: 'Critical',
      priorityReason:
        'Infrastructure Rule #3: Major water pipeline burst causing active street flooding and supply loss.',
      classificationSource: 'ai',
      city: 'New Delhi',
      wardCode: 'DEL-W78',
      wardName: 'Karol Bagh Central (Ward 78)',
      locality: 'Ajmal Khan Road',
      landmark: 'Block 14 Market Lane',
      citizenName: 'Meनाक्षी वर्मा / Meenakshi Verma (Fictional Sample)',
      citizenPhone: '+91-98111-04455',
      citizenEmail: null,
      departmentCode: 'WATER',
      departmentName: 'Water Supply & Jal Board Department',
      requiresManualAssignment: false,
      assignedOfficerName: 'Er. Vikram Nair (DJB Ward Engineer)',
      duplicateOfTrackingCode: 'CS-DEL-2026-1001',
      status: 'Pending',
      createdAt: new Date(now - 5 * 3600 * 1000),
      slaDeadline: new Date(now + 1 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Meenakshi Verma (Citizen)',
          comment:
            'Submitted in Hindi and linked to active locality cluster CS-DEL-2026-1001 while preserving individual Tracking ID.',
          createdAt: new Date(now - 5 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-BLR-2026-1005',
      pin: '5566',
      language: 'ta',
      rawDescription:
        'கோரமங்களா 80 அடி சாலையில் கடந்த चार நாட்களாக 6 தெரு விளக்குகள் எரியவில்லை, இரவில் நடந்து செல்ல பாதுகாப்பற்றதாக உள்ளது.',
      interpretedSummary:
        'Six consecutive LED streetlights non-functional on 80 Feet Road, Koramangala for four days causing dark unsafe pedestrian stretch at night.',
      category: 'Streetlights',
      priority: 'Medium',
      priorityReason: 'Multi-pole streetlight outage impacting night pedestrian visibility (48h SLA).',
      classificationSource: 'ai',
      city: 'Bengaluru',
      wardCode: 'BLR-W151',
      wardName: 'Koramangala (Ward 151)',
      locality: '80 Feet Road',
      landmark: 'Near Sony World Signal Bus Stop',
      citizenName: 'Senthilnathan K (Fictional Sample)',
      citizenPhone: '+91-98801-05566',
      citizenEmail: null,
      departmentCode: 'STREETLIGHTS',
      departmentName: 'Municipal Streetlight Electrical Maintenance Team',
      requiresManualAssignment: false,
      assignedOfficerName: 'Jr. Er. Manoj Hegde (BBMP Electrical)',
      duplicateOfTrackingCode: null,
      status: 'In Progress',
      createdAt: new Date(now - 18 * 3600 * 1000),
      slaDeadline: new Date(now + 30 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Senthilnathan K (Citizen)',
          comment: 'Grievance submitted in Tamil; routed to Municipal Streetlight Electrical Team.',
          createdAt: new Date(now - 18 * 3600 * 1000),
        },
        {
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          actorRole: 'officer',
          actorName: 'Jr. Er. Manoj Hegde (BBMP Electrical)',
          comment: 'Feeder relay fault identified on Pole #14–#19; replacement relay ordered for evening inspection.',
          createdAt: new Date(now - 6 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-PUN-2026-1006',
      pin: '6677',
      language: 'hi',
      rawDescription:
        'शिवाजीनगर बस स्टैंड के पीछे सार्वजनिक सूचना बोर्ड टूटा हुआ है और आवारा पशुओं के कारण यात्रियों को परेशानी हो रही है।',
      interpretedSummary:
        'Damaged public civic notice board and stray cattle obstruction behind Shivajinagar Bus Stand requiring cross-departmental nodal assignment.',
      category: 'Other Civic Issues',
      priority: 'Low',
      priorityReason: 'Multi-departmental general civic maintenance item queued for Nodal Officer assignment.',
      classificationSource: 'rule_fallback',
      city: 'Pune',
      wardCode: 'PUN-W14',
      wardName: 'Shivajinagar Ghole Road (Ward 14)',
      locality: 'Shivajinagar',
      landmark: 'Behind State Transport Bus Stand',
      citizenName: 'Pooja Joshi (Fictional Sample)',
      citizenPhone: '+91-97650-06677',
      citizenEmail: null,
      departmentCode: 'CIVIC_GENERAL',
      departmentName: 'Central Nodal Triage & General Administration',
      requiresManualAssignment: true,
      assignedOfficerName: null,
      duplicateOfTrackingCode: null,
      status: 'Pending',
      createdAt: new Date(now - 10 * 3600 * 1000),
      slaDeadline: new Date(now + 110 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Pooja Joshi (Citizen)',
          comment: 'Classified via Automated Rule-Based Fallback; flagged for Manual Nodal Assignment.',
          createdAt: new Date(now - 10 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-CHD-2026-1007',
      pin: '7788',
      language: 'pa',
      rawDescription:
        'ਸੈਕਟਰ 22 ਸ਼ਾਸਤਰੀ ਮਾਰਕੀਟ ਦੇ ਨੇੜੇ ਪਾਰਕ ਦੇ ਬਾਹਰ ਤੇਜ਼ ਹਵਾ ਕਾਰਨ ਵੱਡਾ ਦਰੱਖਤ ਸੜਕ ਉੱਤੇ ਡਿੱਗ ਗਿਆ ਹੈ ਅਤੇ ਆਵਾਜਾਈ ਰੁਕ ਗਈ ਹੈ।',
      interpretedSummary:
        'Large uprooted tree blocking internal sector road outside neighborhood park near Sector 22 Shastri Market, Chandigarh requiring immediate horticulture clearance.',
      category: 'Parks and Horticulture',
      priority: 'High',
      priorityReason: 'Urgency Rule: Fallen tree obstructing commuter road outside Sector 22 market.',
      classificationSource: 'ai',
      city: 'Chandigarh',
      wardCode: 'CHD-W16',
      wardName: 'Sector 22, 23 & 35 Commercial Hub (Ward 16)',
      locality: 'Sector 22 Shastri Market',
      landmark: 'Near Bus Stand Chowk, Sector 22-B',
      citizenName: 'Harpreet Singh Gill (Fictional Sample)',
      citizenPhone: '+91-98154-07788',
      citizenEmail: null,
      departmentCode: 'PARKS',
      departmentName: 'Parks, Horticulture & Tree Maintenance Wing',
      requiresManualAssignment: false,
      assignedOfficerName: 'SDO Gurpreet Brar (MCC Horticulture)',
      duplicateOfTrackingCode: null,
      status: 'In Progress',
      createdAt: new Date(now - 5.5 * 3600 * 1000),
      slaDeadline: new Date(now + 18.5 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Harpreet Singh Gill (Citizen)',
          comment: 'Submitted in Punjabi; mapped to MCC Ward 16 Parks & Horticulture Wing.',
          createdAt: new Date(now - 5.5 * 3600 * 1000),
        },
        {
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          actorRole: 'officer',
          actorName: 'SDO Gurpreet Brar (MCC Horticulture)',
          comment: 'MCC pruning & hydraulic crane van dispatched from Sector 17 depot to clear fallen branches.',
          createdAt: new Date(now - 2 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-GGN-2026-1008',
      pin: '8899',
      language: 'hinglish',
      rawDescription:
        'Gurugram Sector 29 Leisure Valley market ke bahar main stormwater drain choke ho gaya hai aur sewer ka ganda paani parking road par bhar raha hai.',
      interpretedSummary:
        'Choked stormwater drain and overflowing sewage accumulating across service lane outside Sector 29 Leisure Valley Market, Gurugram.',
      category: 'Drainage and Sewage',
      priority: 'High',
      priorityReason: 'Active sewage overflow on high-footfall commercial service road (24h SLA).',
      classificationSource: 'ai',
      city: 'Gurugram',
      wardCode: 'GGN-W28',
      wardName: 'Sector 29, Golf Course Ext & Sohna Road (Ward 28)',
      locality: 'Sector 29 Leisure Valley',
      landmark: 'Opposite IFFCO Chowk Metro Feeder Stand',
      citizenName: 'Nitin Deswal (Fictional Sample)',
      citizenPhone: '+91-98182-08899',
      citizenEmail: null,
      departmentCode: 'DRAINAGE',
      departmentName: 'Stormwater Drainage & Sewerage Wing',
      requiresManualAssignment: false,
      assignedOfficerName: 'Er. Sandeep Hooda (MCG Zone IV)',
      duplicateOfTrackingCode: null,
      status: 'Pending',
      createdAt: new Date(now - 4 * 3600 * 1000),
      slaDeadline: new Date(now + 20 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'unverified',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Nitin Deswal (Citizen)',
          comment: 'Registered in Hinglish; routed to MCG Zone IV Drainage & Sewerage Wing.',
          createdAt: new Date(now - 4 * 3600 * 1000),
        },
      ],
    },
    {
      trackingCode: 'CS-JAI-2026-1009',
      pin: '9900',
      language: 'hi',
      rawDescription:
        'जयपुर मानसरोवर सेक्टर 5 मुख्य मध्यम मार्ग पर आवारा पशुओं का झुंड सड़क के बीच बैठा रहता है जिससे शाम के समय दुर्घटना का गंभीर खतरा बना हुआ है।',
      interpretedSummary:
        'Herd of stray cattle obstructing main commuter carriageway on Madhyam Marg, Mansarovar Sector 5, Jaipur causing evening traffic hazard.',
      category: 'Stray Animals and Cattle',
      priority: 'Medium',
      priorityReason: 'Verified stray cattle traffic obstruction routed to JMC Greater Veterinary Cell (48h SLA).',
      classificationSource: 'ai',
      city: 'Jaipur',
      wardCode: 'JAI-W42',
      wardName: 'Mansarovar & Sodala (Ward 42)',
      locality: 'Mansarovar Sector 1-9',
      landmark: 'Madhyam Marg Crossing near Shipra Path',
      citizenName: 'Devendra Rathore (Fictional Sample)',
      citizenPhone: '+91-94140-09900',
      citizenEmail: null,
      departmentCode: 'VETERINARY',
      departmentName: 'Municipal Veterinary & Stray Cattle Control Cell',
      requiresManualAssignment: false,
      assignedOfficerName: 'Dr. Mahendra Choudhary (JMC Greater Cattle Cell)',
      duplicateOfTrackingCode: null,
      status: 'Resolved',
      createdAt: new Date(now - 30 * 3600 * 1000),
      slaDeadline: new Date(now + 18 * 3600 * 1000),
      isEscalated: false,
      escalatedAt: null,
      resolutionVerifiedStatus: 'confirmed',
      beforeImage: null,
      afterImage: null,
      historyEntries: [
        {
          previousStatus: null,
          newStatus: 'Pending',
          actorRole: 'citizen',
          actorName: 'Devendra Rathore (Citizen)',
          comment: 'Submitted in Hindi; routed to JMC Greater Veterinary & Stray Cattle Cell.',
          createdAt: new Date(now - 30 * 3600 * 1000),
        },
        {
          previousStatus: 'Pending',
          newStatus: 'Resolved',
          actorRole: 'officer',
          actorName: 'Dr. Mahendra Choudhary (JMC Greater Cattle Cell)',
          comment: 'Cattle-catching squad safely relocated 7 stray cattle to Hingonia Gaushala rehabilitation center.',
          createdAt: new Date(now - 12 * 3600 * 1000),
        },
      ],
    },
  ];

  for (const item of sampleItems) {
    if (existingCodes.has(item.trackingCode)) {
      continue;
    }
    const [inserted] = await db
      .insert(complaints)
      .values({
        trackingCode: item.trackingCode,
        accessPinHash: hashAccessPin(item.pin),
        demoPinHint: item.pin,
        language: item.language,
        rawDescription: item.rawDescription,
        interpretedSummary: item.interpretedSummary,
        category: item.category,
        priority: item.priority,
        priorityReason: item.priorityReason,
        classificationSource: item.classificationSource,
        city: item.city,
        wardCode: item.wardCode,
        wardName: item.wardName,
        locality: item.locality,
        landmark: item.landmark,
        citizenName: item.citizenName,
        citizenPhone: item.citizenPhone,
        citizenEmail: item.citizenEmail,
        departmentCode: item.departmentCode,
        departmentName: item.departmentName,
        requiresManualAssignment: item.requiresManualAssignment,
        assignedOfficerUid: null,
        assignedOfficerName: item.assignedOfficerName,
        duplicateOfTrackingCode: item.duplicateOfTrackingCode,
        status: item.status,
        slaDeadline: item.slaDeadline,
        isEscalated: item.isEscalated,
        escalatedAt: item.escalatedAt,
        resolutionVerifiedStatus: item.resolutionVerifiedStatus,
        isSampleDemo: true,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
      })
      .returning();

    if (!inserted) continue;

    await db.insert(complaintAssignments).values({
      complaintId: inserted.id,
      departmentCode: item.departmentCode,
      assignedToUid: null,
      assignedToName: item.assignedOfficerName || 'Pending Manual Assignment',
      assignedByName: 'CivicSaathi Smart Router',
      routingType: item.requiresManualAssignment ? 'manual_override' : 'smart_auto',
      notes: item.requiresManualAssignment
        ? 'Requires Nodal Officer review to determine responsible municipal unit.'
        : `Auto-routed via verified locality (${item.locality} → ${item.wardCode}).`,
      createdAt: item.createdAt,
    });

    for (const h of item.historyEntries) {
      await db.insert(statusHistory).values({
        complaintId: inserted.id,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        actorRole: h.actorRole,
        actorName: h.actorName,
        comment: h.comment,
        createdAt: h.createdAt,
      });
    }

    await db.insert(notifications).values({
      complaintId: inserted.id,
      channel: 'in_app_ledger',
      recipientMasked: maskPhone(item.citizenPhone),
      subject: `Complaint Registered: ${item.trackingCode}`,
      message: `Recorded in portal ledger (${item.departmentName}). External SMS/Email provider not configured in prototype mode.`,
      deliveryState: 'logged_no_external_provider',
      createdAt: item.createdAt,
    });

    if (item.beforeImage) {
      await db.insert(uploadedEvidence).values({
        complaintId: inserted.id,
        stage: 'submission_before',
        mimeType: 'image/jpeg',
        imageUrl: item.beforeImage,
        caption: 'Citizen submitted pre-repair street photograph (Sample Demo)',
        uploadedByRole: 'citizen',
        createdAt: item.createdAt,
      });
    }

    if (item.afterImage) {
      await db.insert(uploadedEvidence).values({
        complaintId: inserted.id,
        stage: 'resolution_after',
        mimeType: 'image/jpeg',
        imageUrl: item.afterImage,
        caption: 'Municipal engineering crew post-repair completion photograph (Sample Demo)',
        uploadedByRole: 'officer',
        createdAt: new Date(now - 8 * 3600 * 1000),
      });
    }
  }
}

export async function runAutoEscalationSweep(): Promise<void> {
  try {
    const now = new Date();
    const overdueRows = await db
      .select()
      .from(complaints)
      .where(
        and(
          inArray(complaints.status, ['Pending', 'In Progress']),
          eq(complaints.isEscalated, false),
          lt(complaints.slaDeadline, now)
        )
      );

    for (const row of overdueRows) {
      await db
        .update(complaints)
        .set({
          isEscalated: true,
          escalatedAt: now,
          updatedAt: now,
        })
        .where(eq(complaints.id, row.id));

      await db.insert(statusHistory).values({
        complaintId: row.id,
        previousStatus: row.status,
        newStatus: row.status,
        actorRole: 'system',
        actorName: 'SLA Escalation Monitor',
        comment:
          'Automatic Escalation: Configured departmental response deadline exceeded. Flagged for Nodal Officer priority review.',
        createdAt: now,
      });

      await db.insert(notifications).values({
        complaintId: row.id,
        channel: 'in_app_ledger',
        recipientMasked: maskPhone(row.citizenPhone),
        subject: `SLA Escalation Alert: ${row.trackingCode}`,
        message: `Complaint ${row.trackingCode} exceeded its SLA deadline and was automatically escalated to senior supervisory review.`,
        deliveryState: 'delivered_in_portal',
        createdAt: now,
      });
    }
  } catch (error) {
    console.error('Auto-escalation sweep failed:', error);
    throw new Error('Failed to evaluate SLA escalations.', { cause: error });
  }
}

export async function resolveWardAndDepartment(params: {
  city: string;
  locality: string;
  category: CivicCategory;
  priority: ComplaintPriority;
}): Promise<{
  ward: WardRecord | null;
  department: DepartmentRecord;
  requiresManualAssignment: boolean;
  slaHours: number;
}> {
  try {
    await ensureSeeded();
    const allDepts = await db.select().from(departments);
    const allWards = await db.select().from(wards);

    const cityWards = allWards.filter((w) => w.city.toLowerCase() === params.city.toLowerCase());
    const locNorm = params.locality.trim().toLowerCase();
    const matchedWard = matchVerifiedLocalityToWard(cityWards, params.locality);

    const mappedDept =
      allDepts.find((d) => d.categoryMapped === params.category) ||
      allDepts.find((d) => d.code === 'CIVIC_GENERAL') ||
      allDepts[0];

    const requiresManualAssignment =
      params.category === 'Other Civic Issues' || !matchedWard || locNorm.includes('unlisted');

    const slaHours = computeSlaHours(mappedDept, params.priority);

    return {
      ward: matchedWard,
      department: mappedDept,
      requiresManualAssignment,
      slaHours,
    };
  } catch (error) {
    console.error('Failed to resolve ward and department:', error);
    throw new Error('Smart routing lookup failed. Please try again.', { cause: error });
  }
}

export async function findPotentialDuplicates(params: {
  city: string;
  locality: string;
  wardCode?: string;
  category: string;
  description: string;
  interpretedSummary: string;
}): Promise<DuplicateCandidate[]> {
  try {
    await ensureSeeded();
    const activeRows = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.city, params.city),
          eq(complaints.category, params.category),
          inArray(complaints.status, ['Pending', 'In Progress'])
        )
      )
      .orderBy(desc(complaints.createdAt));

    if (activeRows.length === 0) {
      return [];
    }

    return await rankDuplicateCandidates({
      locality: params.locality,
      wardCode: params.wardCode,
      description: params.description,
      interpretedSummary: params.interpretedSummary,
      candidates: activeRows.map((row) => ({
        trackingCode: row.trackingCode,
        category: row.category,
        locality: row.locality,
        wardCode: row.wardCode,
        wardName: row.wardName,
        rawDescription: row.rawDescription,
        interpretedSummary: row.interpretedSummary,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        duplicateOfTrackingCode: row.duplicateOfTrackingCode,
      })),
    });
  } catch (error) {
    console.error('Duplicate detection query failed:', error);
    return [];
  }
}

export async function createCitizenComplaint(input: {
  language: string;
  rawDescription: string;
  interpretedSummary: string;
  category: CivicCategory;
  priority: ComplaintPriority;
  priorityReason: string;
  classificationSource: 'ai' | 'rule_fallback';
  city: string;
  locality: string;
  landmark: string | null;
  citizenName: string;
  citizenPhone: string | null;
  citizenEmail: string | null;
  duplicateOfTrackingCode: string | null;
  beforeEvidence: { mimeType: string; imageUrl: string } | null;
}): Promise<{
  trackingCode: string;
  accessPin: string;
  departmentName: string;
  wardName: string;
  slaDeadline: string;
  requiresManualAssignment: boolean;
}> {
  try {
    await ensureSeeded();
    const routing = await resolveWardAndDepartment({
      city: input.city,
      locality: input.locality,
      category: input.category,
      priority: input.priority,
    });

    let trackingCode = generateTrackingCode(input.city);
    // Guarantee uniqueness
    const existingCheck = await db
      .select({ id: complaints.id })
      .from(complaints)
      .where(eq(complaints.trackingCode, trackingCode));
    if (existingCheck.length > 0) {
      trackingCode = generateTrackingCode(input.city);
    }

    const accessPin = generatePinCode();
    const slaDeadline = hoursFromNow(routing.slaHours);
    const wardCode = routing.ward
      ? routing.ward.wardCode
      : `${getTrackingPrefixForCity(input.city)}-UNVERIFIED`;
    const wardName = routing.ward
      ? `${routing.ward.wardName} (Ward ${routing.ward.wardNumber})`
      : 'Unverified Locality — Nodal Ward Queue';

    const now = new Date();

    const [created] = await db
      .insert(complaints)
      .values({
        trackingCode,
        accessPinHash: hashAccessPin(accessPin),
        demoPinHint: null, // Never store plaintext PIN for real citizen submissions
        language: input.language,
        rawDescription: input.rawDescription,
        interpretedSummary: input.interpretedSummary,
        category: input.category,
        priority: input.priority,
        priorityReason: input.priorityReason,
        classificationSource: input.classificationSource,
        city: input.city,
        wardCode,
        wardName,
        locality: input.locality,
        landmark: input.landmark,
        citizenName: input.citizenName,
        citizenPhone: input.citizenPhone,
        citizenEmail: input.citizenEmail,
        departmentCode: routing.department.code,
        departmentName: routing.department.nameEn,
        requiresManualAssignment: routing.requiresManualAssignment,
        assignedOfficerUid: null,
        assignedOfficerName: routing.requiresManualAssignment
          ? null
          : `${routing.department.code} Duty Officer (${routing.ward?.municipalBody || input.city})`,
        duplicateOfTrackingCode: input.duplicateOfTrackingCode,
        status: 'Pending',
        slaDeadline,
        isEscalated: false,
        escalatedAt: null,
        resolutionVerifiedStatus: 'unverified',
        isSampleDemo: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new Error('Complaint could not be saved.');
    }

    await db.insert(complaintAssignments).values({
      complaintId: created.id,
      departmentCode: routing.department.code,
      assignedToUid: null,
      assignedToName: routing.requiresManualAssignment
        ? 'Pending Manual Assignment'
        : `${routing.department.nameEn} Queue`,
      assignedByName: 'CivicSaathi Smart Router',
      routingType: routing.requiresManualAssignment ? 'manual_override' : 'smart_auto',
      notes: routing.requiresManualAssignment
        ? 'Queued for Nodal Officer manual department assignment.'
        : `Automatically routed via locality "${input.locality}" → ${wardName}.`,
      createdAt: now,
    });

    const clusterNote = input.duplicateOfTrackingCode
      ? ` Linked to existing locality cluster ${input.duplicateOfTrackingCode} while preserving independent Tracking ID.`
      : '';

    await db.insert(statusHistory).values({
      complaintId: created.id,
      previousStatus: null,
      newStatus: 'Pending',
      actorRole: 'citizen',
      actorName: `${input.citizenName} (Citizen)`,
      comment: `Complaint confirmed and registered (${input.classificationSource === 'ai' ? 'AI Multilingual Triage' : 'Automated Rule-Based Classification'}). Routed to ${routing.department.nameEn}.${clusterNote}`,
      createdAt: now,
    });

    await db.insert(notifications).values({
      complaintId: created.id,
      channel: input.citizenPhone ? 'sms_gateway_simulated' : 'in_app_ledger',
      recipientMasked: input.citizenPhone ? maskPhone(input.citizenPhone) : maskEmail(input.citizenEmail),
      subject: `Registered: ${trackingCode}`,
      message: `Complaint ${trackingCode} registered with ${routing.department.nameEn}. Expected response by ${slaDeadline.toUTCString()}. (Logged in portal ledger; external SMS/email gateway not attached in prototype).`,
      deliveryState: 'logged_no_external_provider',
      createdAt: now,
    });

    if (input.beforeEvidence) {
      await db.insert(uploadedEvidence).values({
        complaintId: created.id,
        stage: 'submission_before',
        mimeType: input.beforeEvidence.mimeType,
        imageUrl: input.beforeEvidence.imageUrl,
        caption: 'Citizen pre-resolution evidence photograph',
        uploadedByRole: 'citizen',
        createdAt: now,
      });
    }

    return {
      trackingCode,
      accessPin,
      departmentName: routing.department.nameEn,
      wardName,
      slaDeadline: slaDeadline.toISOString(),
      requiresManualAssignment: routing.requiresManualAssignment,
    };
  } catch (error) {
    console.error('Failed to create citizen complaint:', error);
    throw new Error('Unable to register complaint at this time. Please try again.', { cause: error });
  }
}

async function hydrateComplaintDetails(
  rows: (typeof complaints.$inferSelect)[],
  includeFullPii: boolean
): Promise<ComplaintDetail[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const codes = rows.map((r) => r.trackingCode);

  const [historyRows, evidenceRows, notifRows, feedbackRows, assignRows, allLinked] = await Promise.all([
    db.select().from(statusHistory).where(inArray(statusHistory.complaintId, ids)),
    db.select().from(uploadedEvidence).where(inArray(uploadedEvidence.complaintId, ids)),
    db.select().from(notifications).where(inArray(notifications.complaintId, ids)),
    db.select().from(resolutionFeedback).where(inArray(resolutionFeedback.complaintId, ids)),
    db.select().from(complaintAssignments).where(inArray(complaintAssignments.complaintId, ids)),
    db.select({
      trackingCode: complaints.trackingCode,
      duplicateOfTrackingCode: complaints.duplicateOfTrackingCode,
    })
      .from(complaints)
      .where(inArray(complaints.duplicateOfTrackingCode, codes)),
  ]);

  return rows.map((row) => {
    const linkedCodes = allLinked
      .filter((l) => l.duplicateOfTrackingCode === row.trackingCode)
      .map((l) => l.trackingCode);

    return {
      id: row.id,
      trackingCode: row.trackingCode,
      language: row.language,
      rawDescription: row.rawDescription,
      interpretedSummary: row.interpretedSummary,
      category: row.category,
      priority: row.priority,
      priorityReason: row.priorityReason,
      classificationSource: row.classificationSource,
      city: row.city,
      wardCode: row.wardCode,
      wardName: row.wardName,
      locality: row.locality,
      landmark: row.landmark,
      citizenName: row.citizenName,
      citizenPhoneMasked: maskPhone(row.citizenPhone),
      citizenPhone: includeFullPii ? row.citizenPhone : undefined,
      citizenEmail: includeFullPii ? row.citizenEmail : undefined,
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
      requiresManualAssignment: row.requiresManualAssignment,
      assignedOfficerUid: row.assignedOfficerUid,
      assignedOfficerName: row.assignedOfficerName,
      duplicateOfTrackingCode: row.duplicateOfTrackingCode,
      duplicateClusterCount: linkedCodes.length + 1,
      linkedDuplicateCodes: linkedCodes,
      status: row.status,
      slaDeadline: row.slaDeadline.toISOString(),
      isEscalated: row.isEscalated,
      escalatedAt: row.escalatedAt ? row.escalatedAt.toISOString() : null,
      resolutionVerifiedStatus: row.resolutionVerifiedStatus,
      isSampleDemo: row.isSampleDemo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      history: historyRows
        .filter((h) => h.complaintId === row.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
      evidence: evidenceRows
        .filter((e) => e.complaintId === row.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      notifications: notifRows
        .filter((n) => n.complaintId === row.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
      feedback: feedbackRows
        .filter((f) => f.complaintId === row.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
      assignments: assignRows
        .filter((a) => a.complaintId === row.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    };
  });
}

export async function trackComplaintWithPin(
  trackingCode: string,
  pin: string
): Promise<ComplaintDetail | null> {
  try {
    await ensureSeeded();
    await runAutoEscalationSweep();

    const normalizedCode = trackingCode
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/\s+/g, '')
      .trim()
      .toUpperCase();
    const rows = await db
      .select()
      .from(complaints)
      .where(eq(complaints.trackingCode, normalizedCode));

    const record = rows[0];
    if (!record) {
      return null;
    }

    if (!verifyAccessPin(pin, record.accessPinHash)) {
      return null;
    }

    const [detail] = await hydrateComplaintDetails([record], false);
    return detail || null;
  } catch (error) {
    console.error('Complaint tracking query failed:', error);
    throw new Error('Unable to look up complaint status right now.', { cause: error });
  }
}

export async function submitResolutionVerification(params: {
  trackingCode: string;
  pin: string;
  outcome: 'confirmed' | 'reopened';
  rating: number | null;
  comment: string;
  reopenEvidence: { mimeType: string; imageUrl: string } | null;
}): Promise<ComplaintDetail> {
  try {
    await ensureSeeded();
    const normalizedCode = params.trackingCode
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/\s+/g, '')
      .trim()
      .toUpperCase();
    const rows = await db
      .select()
      .from(complaints)
      .where(eq(complaints.trackingCode, normalizedCode));

    const record = rows[0];
    if (!record || !verifyAccessPin(params.pin, record.accessPinHash)) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (record.status !== 'Resolved') {
      throw new Error('NOT_IN_RESOLVED_STATE');
    }

    const now = new Date();

    await db.insert(resolutionFeedback).values({
      complaintId: record.id,
      outcome: params.outcome,
      rating: params.outcome === 'confirmed' ? params.rating : null,
      citizenComment: params.comment,
      createdAt: now,
    });

    if (params.reopenEvidence && params.outcome === 'reopened') {
      await db.insert(uploadedEvidence).values({
        complaintId: record.id,
        stage: 'reopen_proof',
        mimeType: params.reopenEvidence.mimeType,
        imageUrl: params.reopenEvidence.imageUrl,
        caption: 'Citizen follow-up photo showing unresolved issue',
        uploadedByRole: 'citizen',
        createdAt: now,
      });
    }

    if (params.outcome === 'confirmed') {
      await db
        .update(complaints)
        .set({
          resolutionVerifiedStatus: 'confirmed',
          updatedAt: now,
        })
        .where(eq(complaints.id, record.id));

      await db.insert(statusHistory).values({
        complaintId: record.id,
        previousStatus: 'Resolved',
        newStatus: 'Resolved',
        actorRole: 'citizen',
        actorName: `${record.citizenName} (Citizen Verification)`,
        comment: `Citizen confirmed resolution${params.rating ? ` (${params.rating}/5 rating)` : ''}: "${params.comment}"`,
        createdAt: now,
      });
    } else {
      const elevatedPriority = record.priority === 'Critical' ? 'Critical' : 'High';
      await db
        .update(complaints)
        .set({
          status: 'In Progress',
          priority: elevatedPriority,
          resolutionVerifiedStatus: 'reopened',
          isEscalated: true,
          escalatedAt: now,
          slaDeadline: hoursFromNow(18),
          updatedAt: now,
        })
        .where(eq(complaints.id, record.id));

      await db.insert(statusHistory).values({
        complaintId: record.id,
        previousStatus: 'Resolved',
        newStatus: 'In Progress',
        actorRole: 'citizen',
        actorName: `${record.citizenName} (Citizen Reopened)`,
        comment: `Citizen reported issue remains unresolved — ticket reopened & escalated: "${params.comment}"`,
        createdAt: now,
      });

      await db.insert(notifications).values({
        complaintId: record.id,
        channel: 'in_app_ledger',
        recipientMasked: maskPhone(record.citizenPhone),
        subject: `Complaint Reopened: ${record.trackingCode}`,
        message: `Ticket ${record.trackingCode} has been reopened to In Progress with High/Critical priority following citizen verification feedback.`,
        deliveryState: 'delivered_in_portal',
        createdAt: now,
      });
    }

    const updatedRows = await db.select().from(complaints).where(eq(complaints.id, record.id));
    const [detail] = await hydrateComplaintDetails(updatedRows, false);
    return detail;
  } catch (error) {
    if (error instanceof Error && (error.message === 'INVALID_CREDENTIALS' || error.message === 'NOT_IN_RESOLVED_STATE')) {
      throw error;
    }
    console.error('Resolution verification failed:', error);
    throw new Error('Could not save resolution verification feedback.', { cause: error });
  }
}

export async function getPublicOverview(): Promise<PublicOverviewResponse> {
  try {
    await ensureSeeded();
    await runAutoEscalationSweep();

    const [allComplaints, deptRows, wardRows, demoEvidenceRows] = await Promise.all([
      db.select().from(complaints).orderBy(desc(complaints.createdAt)),
      db.select().from(departments),
      db.select().from(wards),
      db.select().from(uploadedEvidence),
    ]);

    const totalComplaints = allComplaints.length;
    const resolvedCount = allComplaints.filter((c) => c.status === 'Resolved').length;
    const inProgressCount = allComplaints.filter((c) => c.status === 'In Progress').length;
    const pendingCount = allComplaints.filter((c) => c.status === 'Pending').length;
    const onTimeCount = allComplaints.filter((c) => !c.isEscalated).length;
    const avgSlaCompliancePct =
      totalComplaints > 0 ? Math.round((onTimeCount / totalComplaints) * 100) : 100;

    const citiesSet = new Set(wardRows.map((w) => w.city));

    // Strictly expose ONLY fictional sample demo records in public showcase!
    const demoRows = allComplaints.filter((c) => c.isSampleDemo && c.demoPinHint);
    const sampleComplaints: PublicDemoCard[] = demoRows.map((c) => {
      const evs = demoEvidenceRows.filter((e) => e.complaintId === c.id);
      const beforeImg = evs.find((e) => e.stage === 'submission_before')?.imageUrl || null;
      const afterImg = evs.find((e) => e.stage === 'resolution_after')?.imageUrl || null;

      return {
        trackingCode: c.trackingCode,
        demoPin: c.demoPinHint || '1122',
        city: c.city,
        wardName: c.wardName,
        locality: c.locality,
        language: c.language,
        rawDescription: c.rawDescription,
        interpretedSummary: c.interpretedSummary,
        category: c.category,
        priority: c.priority,
        departmentName: c.departmentName,
        status: c.status,
        isEscalated: c.isEscalated,
        requiresManualAssignment: c.requiresManualAssignment,
        duplicateOfTrackingCode: c.duplicateOfTrackingCode,
        resolutionVerifiedStatus: c.resolutionVerifiedStatus,
        beforeImageUrl: beforeImg,
        afterImageUrl: afterImg,
        createdAt: c.createdAt.toISOString(),
      };
    });

    return {
      stats: {
        totalComplaints,
        resolvedCount,
        inProgressCount,
        pendingCount,
        avgSlaCompliancePct,
        citiesCovered: citiesSet.size,
      },
      departments: deptRows,
      wards: wardRows,
      sampleComplaints,
    };
  } catch (error) {
    console.error('Public overview query failed:', error);
    throw new Error('Failed to load civic portal overview.', { cause: error });
  }
}

export async function getOrCreateOfficerUser(params: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<OfficerProfile> {
  try {
    await ensureSeeded();
    const normalizedEmail = params.email.trim().toLowerCase();
    const existingUsers = await db.select().from(users);
    const hasAnySuperAdmin = existingUsers.some((u) => u.role === 'super_admin');
    const isOwnerEmail = normalizedEmail === OWNER_EMAIL;

    const existingSelf = existingUsers.find((u) => u.uid === params.uid);
    const initialRole = existingSelf
      ? existingSelf.role
      : isOwnerEmail || !hasAnySuperAdmin
        ? 'super_admin'
        : 'department_officer';
    const initialDept = existingSelf
      ? existingSelf.departmentCode
      : initialRole === 'super_admin'
        ? null
        : 'WATER';

    const [upserted] = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        displayName: params.displayName || normalizedEmail.split('@')[0] || 'Municipal Officer',
        role: initialRole,
        departmentCode: initialDept,
        cityScope: null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          displayName: params.displayName || normalizedEmail.split('@')[0] || 'Municipal Officer',
        },
      })
      .returning();

    return {
      id: upserted.id,
      uid: upserted.uid,
      email: upserted.email,
      displayName: upserted.displayName,
      role: upserted.role,
      departmentCode: upserted.departmentCode,
      cityScope: upserted.cityScope,
      canSimulateRoles: isOwnerEmail || upserted.role === 'super_admin',
    };
  } catch (error) {
    console.error('Failed to sync officer user:', error);
    throw new Error('Unable to verify officer profile in database.', { cause: error });
  }
}

export async function updateOfficerScope(params: {
  requesterUid: string;
  requesterEmail: string;
  targetUid: string;
  role: 'super_admin' | 'department_officer';
  departmentCode: string | null;
  cityScope: string | null;
}): Promise<OfficerProfile> {
  try {
    const requesterRows = await db.select().from(users).where(eq(users.uid, params.requesterUid));
    const requester = requesterRows[0];
    const isBootstrappedOwner = params.requesterEmail.trim().toLowerCase() === OWNER_EMAIL;

    if (!requester || (requester.role !== 'super_admin' && !isBootstrappedOwner)) {
      throw new Error('FORBIDDEN_ROLE_CHANGE');
    }

    const effectiveDept = params.role === 'super_admin' ? null : params.departmentCode || 'WATER';

    const [updated] = await db
      .update(users)
      .set({
        role: params.role,
        departmentCode: effectiveDept,
        cityScope: params.cityScope || null,
      })
      .where(eq(users.uid, params.targetUid))
      .returning();

    if (!updated) {
      throw new Error('Target officer account not found.');
    }

    return {
      id: updated.id,
      uid: updated.uid,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      departmentCode: updated.departmentCode,
      cityScope: updated.cityScope,
      canSimulateRoles: isBootstrappedOwner || updated.role === 'super_admin',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN_ROLE_CHANGE') {
      throw error;
    }
    console.error('Failed to update officer scope:', error);
    throw new Error('Could not update officer role or department assignment.', { cause: error });
  }
}

export async function getOfficerDashboardData(
  profile: OfficerProfile
): Promise<OfficerDashboardResponse> {
  try {
    await ensureSeeded();
    await runAutoEscalationSweep();

    const [allRows, deptRows, wardRows, userRows] = await Promise.all([
      db.select().from(complaints).orderBy(desc(complaints.createdAt)),
      db.select().from(departments),
      db.select().from(wards),
      db.select().from(users),
    ]);

    // Strict RBAC filtering: Department Officers only see authorized department & city scope
    const authorizedRows = allRows.filter((row) => {
      if (profile.role !== 'super_admin' && profile.departmentCode) {
        if (row.departmentCode !== profile.departmentCode) return false;
      }
      if (profile.cityScope && row.city !== profile.cityScope) {
        return false;
      }
      return true;
    });

    const hydrated = await hydrateComplaintDetails(authorizedRows, true);
    const nowMs = Date.now();

    const kpis = {
      total: hydrated.length,
      pending: hydrated.filter((c) => c.status === 'Pending').length,
      inProgress: hydrated.filter((c) => c.status === 'In Progress').length,
      resolved: hydrated.filter((c) => c.status === 'Resolved').length,
      rejected: hydrated.filter((c) => c.status === 'Rejected').length,
      overdue: hydrated.filter(
        (c) =>
          (c.status === 'Pending' || c.status === 'In Progress') &&
          (c.isEscalated || new Date(c.slaDeadline).getTime() < nowMs)
      ).length,
      manualQueue: hydrated.filter((c) => c.requiresManualAssignment && c.status === 'Pending').length,
    };

    const catMap = new Map<string, { category: string; total: number; resolved: number }>();
    for (const c of hydrated) {
      const entry = catMap.get(c.category) || { category: c.category, total: 0, resolved: 0 };
      entry.total += 1;
      if (c.status === 'Resolved') entry.resolved += 1;
      catMap.set(c.category, entry);
    }

    const cityMap = new Map<string, { city: string; total: number; overdue: number; resolved: number }>();
    for (const c of hydrated) {
      const entry = cityMap.get(c.city) || { city: c.city, total: 0, overdue: 0, resolved: 0 };
      entry.total += 1;
      if (c.status === 'Resolved') entry.resolved += 1;
      if (
        (c.status === 'Pending' || c.status === 'In Progress') &&
        (c.isEscalated || new Date(c.slaDeadline).getTime() < nowMs)
      ) {
        entry.overdue += 1;
      }
      cityMap.set(c.city, entry);
    }

    const officerProfiles: OfficerProfile[] = userRows.map((u) => ({
      id: u.id,
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      departmentCode: u.departmentCode,
      cityScope: u.cityScope,
      canSimulateRoles: u.email.toLowerCase() === OWNER_EMAIL || u.role === 'super_admin',
    }));

    return {
      profile,
      kpis,
      byCategory: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
      byCity: Array.from(cityMap.values()).sort((a, b) => b.total - a.total),
      complaints: hydrated,
      officers: profile.role === 'super_admin' ? officerProfiles : [profile],
      departments: deptRows,
      wards: wardRows,
    };
  } catch (error) {
    console.error('Officer dashboard query failed:', error);
    throw new Error('Failed to load officer dashboard data.', { cause: error });
  }
}

export async function updateComplaintByOfficer(params: {
  officer: OfficerProfile;
  trackingCode: string;
  newStatus?: ComplaintStatus;
  newDepartmentCode?: string;
  assignedOfficerName?: string;
  newPriority?: ComplaintPriority;
  comment: string;
  afterEvidence?: { mimeType: string; imageUrl: string } | null;
}): Promise<ComplaintDetail> {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(complaints)
      .where(eq(complaints.trackingCode, params.trackingCode.trim().toUpperCase()));

    const existing = rows[0];
    if (!existing) {
      throw new Error('NOT_FOUND');
    }

    // Enforce RBAC authorization
    if (
      params.officer.role !== 'super_admin' &&
      params.officer.departmentCode &&
      existing.departmentCode !== params.officer.departmentCode
    ) {
      throw new Error('FORBIDDEN_DEPARTMENT');
    }
    if (params.officer.cityScope && existing.city !== params.officer.cityScope) {
      throw new Error('FORBIDDEN_DEPARTMENT');
    }

    const allDepts = await db.select().from(departments);
    const targetDeptCode = params.newDepartmentCode || existing.departmentCode;
    if (params.officer.role !== 'super_admin' && targetDeptCode !== existing.departmentCode) {
      throw new Error('FORBIDDEN_DEPARTMENT');
    }

    const targetDept = allDepts.find((d) => d.code === targetDeptCode);
    const nextDepartmentName = targetDept ? targetDept.nameEn : existing.departmentName;
    const nextStatus = params.newStatus || (existing.status as ComplaintStatus);
    const nextPriority = params.newPriority || (existing.priority as ComplaintPriority);
    const nextOfficerName =
      params.assignedOfficerName !== undefined
        ? params.assignedOfficerName || params.officer.displayName
        : existing.assignedOfficerName || params.officer.displayName;

    const now = new Date();
    const manualCleared =
      targetDeptCode !== 'CIVIC_GENERAL' || Boolean(params.assignedOfficerName)
        ? false
        : existing.requiresManualAssignment;

    await db
      .update(complaints)
      .set({
        status: nextStatus,
        priority: nextPriority,
        departmentCode: targetDeptCode,
        departmentName: nextDepartmentName,
        requiresManualAssignment: manualCleared,
        assignedOfficerUid: params.officer.uid,
        assignedOfficerName: nextOfficerName,
        resolutionVerifiedStatus:
          nextStatus === 'Resolved' && existing.status !== 'Resolved'
            ? 'unverified'
            : existing.resolutionVerifiedStatus,
        updatedAt: now,
      })
      .where(eq(complaints.id, existing.id));

    if (targetDeptCode !== existing.departmentCode || params.assignedOfficerName) {
      await db.insert(complaintAssignments).values({
        complaintId: existing.id,
        departmentCode: targetDeptCode,
        assignedToUid: params.officer.uid,
        assignedToName: nextOfficerName,
        assignedByName: `${params.officer.displayName} (${params.officer.role === 'super_admin' ? 'Nodal Admin' : 'Officer'})`,
        routingType: targetDeptCode !== existing.departmentCode ? 'manual_override' : 'officer_claim',
        notes: params.comment,
        createdAt: now,
      });
    }

    await db.insert(statusHistory).values({
      complaintId: existing.id,
      previousStatus: existing.status,
      newStatus: nextStatus,
      actorRole: params.officer.role === 'super_admin' ? 'admin' : 'officer',
      actorName: `${params.officer.displayName} (${nextDepartmentName})`,
      comment: params.comment,
      createdAt: now,
    });

    if (params.afterEvidence) {
      await db.insert(uploadedEvidence).values({
        complaintId: existing.id,
        stage: 'resolution_after',
        mimeType: params.afterEvidence.mimeType,
        imageUrl: params.afterEvidence.imageUrl,
        caption: `Post-resolution completion photo uploaded by ${params.officer.displayName}`,
        uploadedByRole: 'officer',
        createdAt: now,
      });
    }

    await db.insert(notifications).values({
      complaintId: existing.id,
      channel: existing.citizenPhone ? 'sms_gateway_simulated' : 'in_app_ledger',
      recipientMasked: maskPhone(existing.citizenPhone),
      subject: `Status Updated to ${nextStatus}: ${existing.trackingCode}`,
      message: `Your grievance ${existing.trackingCode} is now "${nextStatus}". Officer note: ${params.comment}`,
      deliveryState: 'delivered_in_portal',
      createdAt: now,
    });

    const refreshed = await db.select().from(complaints).where(eq(complaints.id, existing.id));
    const [detail] = await hydrateComplaintDetails(refreshed, true);
    return detail;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'NOT_FOUND' || error.message === 'FORBIDDEN_DEPARTMENT')
    ) {
      throw error;
    }
    console.error('Officer complaint update failed:', error);
    throw new Error('Failed to update complaint record.', { cause: error });
  }
}
