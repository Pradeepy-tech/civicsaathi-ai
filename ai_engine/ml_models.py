"""
Core Machine Learning Models for CivicSaathi AI (Implemented in Python 3).

Includes:
1. `MultilingualFeatureExtractor`: Unicode NFKC normalization, Indic script preservation,
   word unigrams, word bigrams, and character 3/4-gram subword tokenization across
   Hindi, Hinglish, English, Marathi, Punjabi, Tamil, Bengali, and Telugu.
2. `MultilingualCivicNaiveBayes`: Multinomial Naive Bayes text classifier with Laplace
   smoothing (`alpha = 0.65`) and calibrated log-sum-exp softmax confidence estimation
   across all 12 verified municipal categories, combined with multilingual domain regex priors.
3. `CivicSeverityScorer`: Hybrid deterministic municipal safety hazard rules + weighted
   urgency feature scorer (`Critical`, `High`, `Medium`, `Low`).
4. `LocationEntityExtractor`: Multilingual Indian civic landmark & locality extractor.
5. `SublinearTfidfBm25DuplicateRanker`: Ensemble duplicate clustering model combining
   Sublinear TF-IDF cosine similarity (`1 + log(tf)`), Okapi BM25 (`k1=1.5, b=0.75`),
   and lexical Jaccard overlap within the same municipal ward/locality.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

CIVIC_CATEGORIES: Tuple[str, ...] = (
    "Water Supply",
    "Drainage and Sewage",
    "Road Damage",
    "Garbage and Sanitation",
    "Streetlights",
    "Electricity",
    "Parks and Horticulture",
    "Encroachment and Illegal Construction",
    "Stray Animals and Cattle",
    "Public Health and Fogging",
    "Public Safety",
    "Other Civic Issues",
)

COMPLAINT_PRIORITIES: Tuple[str, ...] = (
    "Critical",
    "High",
    "Medium",
    "Low",
)

MULTILINGUAL_TRAINING_CORPUS: Tuple[Tuple[str, str], ...] = (
    ("Water Supply", "drinking water supply not coming in taps since morning dry tap jal board"),
    ("Water Supply", "main water pipeline burst leaking thousands of litres clean water on road"),
    ("Water Supply", "dirty contaminated muddy foul smelling water coming in household tap supply"),
    ("Water Supply", "low water pressure in sector colony overhead water tank empty tanker needed"),
    ("Water Supply", "paani ki pipeline phat gayi hai subah se ghar mein paani nahi aa raha jal board"),
    ("Water Supply", "nal mein ganda badbudaar paani aa raha hai drinking water leak pipeline"),
    ("Water Supply", "सुबह से घरों में पीने का पानी नहीं आ रहा है पानी की मुख्य पाइपलाइन टूटी हुई है पेयजल समस्या"),
    ("Water Supply", "नल में गंदा और बदबूदार पानी आ रहा है जल आपूर्ति पूरी तरह बाधित है"),
    ("Water Supply", "पिण्याच्या पाण्याची पाईपलाईन फुटली आहे नळाला पाणी येत नाही पाणी पुरवठा खंडित"),
    ("Water Supply", "ਪੈਣ ਵਾਲੇ ਪਾਣੀ ਦੀ ਪਾਈਪ ਲੀਕ ਹੋ ਰਹੀ ਹੈ ਘਰਾਂ ਵਿੱਚ ਪਾਣੀ ਦੀ ਸਪਲਾਈ ਬੰਦ ਹੈ"),
    ("Water Supply", "குடிநீர் குழாய் உடைந்து தண்ணீர் சாலையில் வீணாகிறது குடிநீர் வரவில்லை"),
    ("Water Supply", "পানীয় জলের পাইপ ফেটে গেছে সকাল থেকে কল দিয়ে জল আসছে না"),
    ("Water Supply", "తాగునీటి పైపు పగిలిపోయింది కుళాయిలలో నీరు రావడం లేదు"),
    ("Drainage and Sewage", "open uncovered broken manhole cover on main road sewage overflowing"),
    ("Drainage and Sewage", "blocked stormwater drain nala choked causing severe waterlogging sewer backflow"),
    ("Drainage and Sewage", "gutter overflowing filthy black sewage water entering house lane"),
    ("Drainage and Sewage", "khula manhole hai sewer ka ganda paani sadak par bhar raha hai drain choke"),
    ("Drainage and Sewage", "naali aur nala jaam ho gaya hai barish ka paani jama waterlogging"),
    ("Drainage and Sewage", "सीवर का ढक्कन खुला मैनहोल टूटा हुआ है गंदा पानी सड़क और घरों में भर रहा है जलभराव नाला जाम"),
    ("Drainage and Sewage", "नाली बंद होने से गटर का पानी गली में बह रहा है ड्रेनेज समस्या"),
    ("Drainage and Sewage", "मुख्य रस्त्यावर गटाराचे झाकण तुटलेले व उघडे आहे सांडपाणी तुंबले आहे ड्रेनेज"),
    ("Drainage and Sewage", "ਸੀਵਰੇਜ ਦਾ ਮੈਨਹੋਲ ਖੁੱਲ੍ਹਾ ਹੈ ਅਤੇ ਨਾਲੀ ਦਾ ਗੰਦਾ ਪਾਣੀ ਗਲੀ ਵਿੱਚ ਭਰਿਆ ਹੋਇਆ ਹੈ"),
    ("Drainage and Sewage", "சாக்கடை அடைப்பு ஏற்பட்டு கழிவுநீர் சாலையில் தேங்கியுள்ளது திறந்த மேன்ஹோல்"),
    ("Drainage and Sewage", "খোলা ম্যানহোল এবং ড্রেন বন্ধ হয়ে রাস্তায় নোংরা জল জমেছে"),
    ("Drainage and Sewage", "డ్రైనేజీ కాలువ మూసుకుపోయి మురుగునీరు రోడ్డుపై ప్రవహిస్తోంది"),
    ("Road Damage", "deep pothole on main road asphalt broken causing two wheeler bikes to skid"),
    ("Road Damage", "damaged broken footpath slabs uneven pavement broken speed breaker road cave in"),
    ("Road Damage", "road dug up and not repaired craters gravel scattered dangerous for commuters"),
    ("Road Damage", "sadak par bahut bada gehra gaddha hai pothole ki wajah se bike gir rahi road tuti"),
    ("Road Damage", "मुख्य सड़क पर गहरा बड़ा गड्ढा है सड़क पूरी तरह टूटी हुई है फुटपाथ क्षतिग्रस्त है दुर्घटना का खतरा"),
    ("Road Damage", "सड़क धंस गई है और गड्ढों में पानी भरा है वाहन चालकों को परेशानी"),
    ("Road Damage", "रस्त्यावर मोठे खड्डे पडले आहेत फुटपाथ तुटलेला आहे रस्ता खराब"),
    ("Road Damage", "ਸੜਕ ਵਿੱਚ ਡੂੰਘੇ ਟੋਏ ਪਏ ਹੋਏ ਹਨ ਜਿਸ ਕਾਰਨ ਹਾਦਸੇ ਹੋ ਰਹੇ ਹਨ"),
    ("Road Damage", "சாலையில் பெரிய பள்ளம் உள்ளது இருசக்கர வாகனங்கள் விபத்தில் சிக்குகின்றன"),
    ("Road Damage", "রাস্তায় বড় গর্ত তৈরি হয়েছে ফুটপাত ভেঙে গেছে"),
    ("Road Damage", "రోడ్డుపై పెద్ద గుంతలు పడ్డాయి వాహనదారులకు ప్రమాదం"),
    ("Garbage and Sanitation", "overflowing municipal garbage dustbin waste pileup not collected for days"),
    ("Garbage and Sanitation", "open dumping of trash plastic waste foul smell unhygienic street sweeping needed"),
    ("Garbage and Sanitation", "door to door garbage van not coming dead animal carcass sanitation"),
    ("Garbage and Sanitation", "kachra gaadi nahi aayi dustbin bhara hua hai charo taraf gandagi aur badbu safai"),
    ("Garbage and Sanitation", "गली में कचरे का ढेर लगा है कूड़ादान ओवरफ्लो हो रहा है सफाई कर्मचारी नहीं आए गंदगी बदबू"),
    ("Garbage and Sanitation", "कचराकुंडी तुडुंब भरली आहे रस्त्यावर कचरा पसरला आहे स्वच्छता नाही"),
    ("Garbage and Sanitation", "ਗਲੀ ਵਿੱਚ ਕੂੜੇ ਦਾ ਢੇਰ ਲੱਗਿਆ ਹੋਇਆ ਹੈ ਡਸਟਬਿਨ ਭਰਿਆ ਹੈ ਸਫਾਈ ਨਹੀਂ ਹੋਈ"),
    ("Garbage and Sanitation", "குப்பைத் தொட்டி நிரம்பி வழிகிறது துப்புரவு பணி நடைபெறவில்லை துர்நாற்றம்"),
    ("Garbage and Sanitation", "রাস্তার পাশে আবর্জনার স্তূপ জমে আছে ডাস্টবিন পরিষ্কার করা হয়নি"),
    ("Garbage and Sanitation", "చెత్త కుండీ నిండిపోయి రోడ్డుపై చెత్త పేరుకుపోయింది దుర్వాసన"),
    ("Streetlights", "led streetlight pole not working dark street stretch at night lamp post broken"),
    ("Streetlights", "six consecutive street lights non functional flickering timer fault unsafe night walk"),
    ("Streetlights", "streetlight kharab hai raat ko pura andhera rehta hai khambhe ki light band"),
    ("Streetlights", "स्ट्रीट लाइट कई दिनों से बंद है रात में सड़क पर घना अंधेरा रहता है खंभे की लाइट खराब"),
    ("Streetlights", "रस्त्यावरील पथदिवे बंद आहेत रात्री अंधार पसरतो"),
    ("Streetlights", "ਗਲੀ ਦੀਆਂ ਸਟਰੀਟ ਲਾਈਟਾਂ ਕਈ ਦਿਨਾਂ ਤੋਂ ਬੰਦ ਹਨ ਰਾਤ ਨੂੰ ਹਨੇਰਾ ਰਹਿੰਦਾ ਹੈ"),
    ("Streetlights", "தெரு விளக்குகள் எரியவில்லை இரவில் நடந்து செல்ல இருட்டாக உள்ளது"),
    ("Streetlights", "রাস্তার স্ট্রিটলাইট জ্বলছে না রাতে অন্ধকার হয়ে থাকে"),
    ("Streetlights", "వీధి దీపాలు వెలగడం లేదు రాత్రిపూట చీకటిగా ఉంది"),
    ("Electricity", "exposed live electric wire hanging low from pole sparking transformer shock hazard"),
    ("Electricity", "frequent unscheduled power cut voltage fluctuation tilted electric pole feeder fault"),
    ("Electricity", "bijli ka nanga taar latak raha hai transformer mein sparking ho rahi power cut"),
    ("Electricity", "बिजली का नंगा तार टूटा हुआ है ट्रांसफार्मर से स्पार्किंग और करंट का खतरा है वोल्टेज बिजली कटौती"),
    ("Electricity", "विजेची तार तुटली आहे ट्रान्सफॉर्मर मधून ठिणग्या येत आहेत वीज खंडित"),
    ("Electricity", "ਬਿਜਲੀ ਦੀਆਂ ਨੰਗੀਆਂ ਤਾਰਾਂ ਲਟਕ ਰਹੀਆਂ ਹਨ ਟਰਾਂਸਫਾਰਮਰ ਵਿੱਚ ਸਪਾਰਕਿੰਗ ਹੋ ਰਹੀ ਹੈ"),
    ("Electricity", "மின்சார கம்பி அறுந்து தொங்குகிறது டிரான்ஸ்பார்மர் தீப்பொறி மின்வெட்டு"),
    ("Electricity", "বিদ্যুতের খোলা তার ঝুলছে ট্রান্সফরমারে স্পার্কিং হচ্ছে"),
    ("Electricity", "విద్యుత్ తీగలు తెగి వేలాడుతున్నాయి ట్రాన్స్‌ఫార్మర్ స్పార్కింగ్"),
    ("Parks and Horticulture", "uprooted fallen tree blocking sector road broken tree branch horticulture pruning"),
    ("Parks and Horticulture", "neighborhood public park overgrown grass weeds broken swings garden benches"),
    ("Parks and Horticulture", "park mein bada ped gir gaya hai jhula tuta hua hai ghaas badi ho gayi"),
    ("Parks and Horticulture", "पार्क के बाहर बड़ा पेड़ गिर गया है टहनी सड़क रोक रही है उद्यान और बगीचे में झूले टूटे हैं"),
    ("Parks and Horticulture", "उद्यानात झाड पडले आहे बागेतील झोपाळे तुटले आहेत"),
    ("Parks and Horticulture", "ਪਾਰਕ ਦੇ ਬਾਹਰ ਵੱਡਾ ਦਰੱਖਤ ਸੜਕ ਉੱਤੇ ਡਿੱਗ ਗਿਆ ਹੈ"),
    ("Encroachment and Illegal Construction", "illegal encroachment blocking pedestrian footpath unauthorized shop ramp"),
    ("Encroachment and Illegal Construction", "construction debris malba dumped on public road illegal building extension"),
    ("Encroachment and Illegal Construction", "footpath par avaidh kabza aur अतिक्रमण hai sadak par malba pada hai"),
    ("Encroachment and Illegal Construction", "फुटपाथ और सरकारी जमीन पर अवैध अतिक्रमण निर्माण और मलबा डालकर रास्ता बंद कर दिया है"),
    ("Encroachment and Illegal Construction", "पदपथावर अनधिकृत बांधकाम आणि अतिक्रमण केले आहे"),
    ("Stray Animals and Cattle", "aggressive stray dogs pack dog bite incident rabies vaccination needed"),
    ("Stray Animals and Cattle", "herd of stray cattle cows sitting in middle of main traffic road monkey menace"),
    ("Stray Animals and Cattle", "awara kutton ka jhund kaat raha hai sadak par gaay aur pashu baithe rehte hain"),
    ("Stray Animals and Cattle", "सड़क पर आवारा पशुओं और गायों का झुंड बैठा रहता है आवारा कुत्तों के काटने का डर बंदरों का आतंक"),
    ("Stray Animals and Cattle", "रस्त्यावर मोकाट जनावरे आणि भटक्या कुत्र्यांचा त्रास वाढला आहे"),
    ("Public Health and Fogging", "mosquito breeding in stagnant water dengue malaria cases anti larval fogging needed"),
    ("Public Health and Fogging", "filthy uncleaned public toilet community urinal without water public health"),
    ("Public Health and Fogging", "machhar bahut ho gaye hain dengue फैल रहा है fogging karwayein public toilet ganda"),
    ("Public Health and Fogging", "मच्छरों का प्रकोप बढ़ गया है डेंगू मलेरिया का खतरा है फॉगिंग कराएं सार्वजनिक शौचालय गंदा है"),
    ("Public Safety", "broken bridge safety railing open unbarricaded construction pit unsafe dark underpass"),
    ("Public Safety", "non working municipal cctv camera abandoned burnt vehicle blocking lane safety risk"),
    ("Public Safety", "nala ki safety railing tuti hui hai khula gaddha bina barricade ke hai unsafe underpass"),
    ("Public Safety", "पुलिया की सुरक्षा रेलिंग टूटी हुई है खुला गड्ढा बिना बैरिकेड के है सार्वजनिक सुरक्षा खतरा"),
    ("Other Civic Issues", "damaged public municipal notice board general civic grievance inquiry"),
    ("Other Civic Issues", "noisy loudspeaker nuisance civic center enquiry general administration"),
    ("Other Civic Issues", "सार्वजनिक सूचना बोर्ड टूटा हुआ है सामान्य नागरिक प्रशासन शिकायत"),
)

KEYWORD_CATEGORY_PATTERNS: Tuple[Tuple[str, re.Pattern[str]], ...] = (
    (
        "Water Supply",
        re.compile(
            r"(water\s*supply|drinking\s*water|tap\s*dry|no\s*water|pipeline|water\s*leak|dirty\s*water|"
            r"contaminated\s*water|jal\s*board|paani|pani|पानी|पेयजल|पाइपलाइन|नल|जल\s*आपूर्ति|पाणी|"
            r"ਪਾਣੀ|குடிநீர்|தண்ணீர்|জল|నీరు)",
            re.IGNORECASE,
        ),
    ),
    (
        "Drainage and Sewage",
        re.compile(
            r"(drain|drainage|sewage|sewer|manhole|gutter|waterlogging|blocked\s*nala|choked\s*drain|"
            r"सीवर|नाला|नाली|जलभराव|गटर|मैनहोल|ड्रेनेज|गटार|ਸੀਵਰੇਜ|ਮੈਨਹੋਲ|சாக்கடை|ড্রেন|ম্যানহোল|డ్రైనేజీ)",
            re.IGNORECASE,
        ),
    ),
    (
        "Road Damage",
        re.compile(
            r"(pothole|road\s*damage|broken\s*road|footpath|pavement|speed\s*breaker|asphalt|sadak|gaddha|"
            r"सड़क|गड्ढा|फुटपाथ|रस्ता|खड्डा|ਸੜਕ|ਟੋਏ|சாலை|பள்ளம்|রাস্তা|গর্ত|రోడ్డు|గుంతలు)",
            re.IGNORECASE,
        ),
    ),
    (
        "Streetlights",
        re.compile(
            r"(streetlight|street\s*light|lamp\s*post|dark\s*street|led\s*pole|light\s*band|"
            r"स्ट्रीट\s*लाइट|स्ट्रीटलाइट|खंभा.*लाइट|अंधेरा|पथदिवे|ਸਟਰੀਟ\s*ਲਾਈਟ|தெரு\s*விளக்கு|স্ট্রিটলাইট|వీధి\s*దీపాలు)",
            re.IGNORECASE,
        ),
    ),
    (
        "Electricity",
        re.compile(
            r"(electricity|power\s*cut|transformer|voltage|electric\s*pole|live\s*wire|sparking|bijli|"
            r"बिजली|ट्रांसफार्मर|वोल्टेज|करंट|तार\s*टूटा|वीज|ਬਿਜਲੀ|மின்சாரம்|বিদ্যুৎ|విద్యుత్)",
            re.IGNORECASE,
        ),
    ),
    (
        "Garbage and Sanitation",
        re.compile(
            r"(garbage|trash|waste|dustbin|sanitation|sweeping|dumping|filth|bad\s*smell|kachra|safai|"
            r"कचरा|कूड़ा|गंदगी|सफाई|डस्टबिन|कचराकुंडी|ਕੂੜੇ|குப்பை|আবর্জনা|చెత్త)",
            re.IGNORECASE,
        ),
    ),
    (
        "Parks and Horticulture",
        re.compile(
            r"(park\s*maintenance|fallen\s*tree|tree\s*branch|uprooted\s*tree|overgrown\s*bushes|garden\s*bench|"
            r"broken\s*swing|horticulture|पार्क|पेड़\s*गिर|टहनी|उद्यान|बगीचा|झूला|ਦਰੱਖਤ|झाड\s*पडले)",
            re.IGNORECASE,
        ),
    ),
    (
        "Encroachment and Illegal Construction",
        re.compile(
            r"(encroachment|illegal\s*construction|footpath\s*blocked|unauthorized\s*shop|"
            r"road\s*blocked\s*by\s*hawker|malba|अतिक्रमण|अवैध\s*निर्माण|कब्जा|मलबा)",
            re.IGNORECASE,
        ),
    ),
    (
        "Stray Animals and Cattle",
        re.compile(
            r"(stray\s*dog|dog\s*bite|cattle\s*on\s*road|stray\s*cattle|stray\s*cow|monkey\s*menace|rabies|"
            r"आवारा\s*कुत्ते|कुत्ते\s*का\s*काटना|आवारा\s*पशु|गाय\s*सड़क|बंदर|मोकाट\s*जनावरे)",
            re.IGNORECASE,
        ),
    ),
    (
        "Public Health and Fogging",
        re.compile(
            r"(fogging|mosquito|dengue|malaria|stagnant\s*water\s*breeding|public\s*toilet|urinal|"
            r"फॉगिंग|मच्छर|डेंगू|मलेरिया|सार्वजनिक\s*शौचालय)",
            re.IGNORECASE,
        ),
    ),
    (
        "Public Safety",
        re.compile(
            r"(public\s*safety|unsafe\s*underpass|broken\s*railing|open\s*pit|cctv|crime\s*spot|"
            r"abandoned\s*vehicle|सुरक्षा\s*रेलिंग|टूटी\s*रेलिंग|खुला\s*गड्ढा)",
            re.IGNORECASE,
        ),
    ),
)

CRITICAL_HAZARD_RULES: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"(open\s*manhole|uncovered\s*manhole|broken\s*manhole|khula\s*manhole|manhole\s*khula|"
            r"खुला\s*मैनहोल|मैनहोल\s*खुला|गटर\s*खुला|गटाराचे\s*झाकण.*उघडे|খোলা\s*ম্যানহোল|ਮੈਨਹੋਲ\s*ਖੁੱਲ੍ਹਾ)",
            re.IGNORECASE,
        ),
        "Safety Rule #1: Open or uncovered manhole poses immediate fall hazard to pedestrians and vehicles.",
    ),
    (
        re.compile(
            r"(live\s*wire|exposed\s*wire|electric\s*shock|sparking\s*transformer|fallen\s*pole|nanga\s*taar|"
            r"bijli\s*ka\s*taar\s*toota|करंट|नंगा\s*तार|बिजली\s*का\s*तार\s*टूटा|स्पार्किंग|ਨੰਗੀਆਂ\s*ਤਾਰਾਂ)",
            re.IGNORECASE,
        ),
        "Safety Rule #2: Exposed electrical hazard / live wire risk.",
    ),
    (
        re.compile(
            r"(burst\s*pipe|pipeline\s*burst|pipeline\s*phat|pipe\s*phat|major\s*water\s*leak|"
            r"flooding\s*road|sewage\s*entering\s*house|पाइपलाइन\s*फट|पाइप\s*फट|पाइपलाइन\s*टूटी|"
            r"पानी\s*की\s*पाइप\s*फट|घर\s*में\s*गंदा\s*पानी|पाईपलाईन\s*फुटली)",
            re.IGNORECASE,
        ),
        "Safety Rule #3: Major water main burst or severe sewage backflow into residential lane.",
    ),
    (
        re.compile(
            r"(road\s*cave|sinkhole|bridge\s*crack|wall\s*collapse|fire|gas\s*leak|sadak\s*dhans|"
            r"सड़क\s*धंस|दीवार\s*गिर|आग)",
            re.IGNORECASE,
        ),
        "Safety Rule #4: Structural collapse or acute public safety emergency.",
    ),
)

HIGH_PRIORITY_RULES: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"(school|hospital|clinic|anganwadi|स्कूल|अस्पताल|विद्यालय|शाळा|शाळेजवळ|ਸਕੂਲ|हॉस्पिटल)",
            re.IGNORECASE,
        ),
        "Urgency Rule: Issue located near a sensitive public zone (school / hospital).",
    ),
    (
        re.compile(
            r"(deep\s*pothole|accident|skid|two-wheeler|bike\s*fell|fallen\s*tree|uprooted\s*tree|"
            r"बड़ा\s*गड्ढा|दुर्घटना|गहरा\s*गड्ढा|pothole|ਦਰੱਖਤ.*ਡਿੱਗ|पेड़\s*गिर)",
            re.IGNORECASE,
        ),
        "Urgency Rule: Commuter road safety hazard risking vehicle accidents.",
    ),
    (
        re.compile(
            r"(no\s*water|water\s*not\s*coming|dark\s*street|complete\s*blackout|overflowing\s*garbage|"
            r"dead\s*animal|dengue|mosquito\s*breeding|rabid\s*dog|dog\s*bite|पानी\s*नहीं\s*आ\s*रहा|"
            r"अंधेरा|कचरा\s*फैल|डेंगू|कुत्ते\s*का\s*काटना)",
            re.IGNORECASE,
        ),
        "Urgency Rule: Essential utility disruption or public health / sanitation risk.",
    ),
)

_NON_TOKEN_RE = re.compile(r"[^\w\s\u0900-\u0D7F]", re.UNICODE)
_WHITESPACE_RE = re.compile(r"\s+")


class MultilingualFeatureExtractor:
    """Extracts word unigrams, word bigrams, and character N-grams across Indian scripts."""

    @staticmethod
    def normalize(text: str) -> str:
        norm = unicodedata.normalize("NFKC", text or "").lower()
        cleaned = _NON_TOKEN_RE.sub(" ", norm)
        return _WHITESPACE_RE.sub(" ", cleaned).strip()

    @classmethod
    def extract_classification_features(cls, text: str) -> List[str]:
        norm = cls.normalize(text)
        if not norm:
            return []

        words = [w for w in norm.split(" ") if len(w) >= 2]
        features: List[str] = [f"w:{w}" for w in words]

        for i in range(len(words) - 1):
            features.append(f"bg:{words[i]}_{words[i + 1]}")

        for word in words:
            if len(word) >= 3:
                padded = f"^{word}$"
                for n in (3, 4):
                    if len(padded) >= n:
                        for idx in range(len(padded) - n + 1):
                            features.append(f"c{n}:{padded[idx : idx + n]}")

        return features

    @classmethod
    def extract_similarity_tokens(cls, text: str) -> List[str]:
        norm = cls.normalize(text)
        if not norm:
            return []

        words = [w for w in norm.split(" ") if len(w) >= 3]
        tokens: List[str] = list(words)
        compact = " ".join(words)
        for idx in range(max(0, len(compact) - 2)):
            gram = compact[idx : idx + 3]
            if " " not in gram:
                tokens.append(f"#{gram}")
        return tokens


class MultilingualCivicNaiveBayes:
    """
    Multinomial Naive Bayes Classifier trained on multilingual Indian civic complaints.
    Uses Laplace smoothing (`alpha=0.65`) and log-sum-exp softmax calibration.
    """

    def __init__(self, alpha: float = 0.65) -> None:
        self.alpha = alpha
        self.class_doc_counts: Dict[str, int] = defaultdict(int)
        self.class_feature_counts: Dict[str, Counter[str]] = defaultdict(Counter)
        self.class_total_features: Dict[str, int] = defaultdict(int)
        self.vocabulary: set[str] = set()
        self.total_docs: int = 0
        self.is_trained: bool = False

    def fit(self, corpus: Sequence[Tuple[str, str]]) -> "MultilingualCivicNaiveBayes":
        for label, text in corpus:
            if label not in CIVIC_CATEGORIES:
                continue
            feats = MultilingualFeatureExtractor.extract_classification_features(text)
            if not feats:
                continue
            self.class_doc_counts[label] += 1
            self.total_docs += 1
            self.class_feature_counts[label].update(feats)
            self.class_total_features[label] += len(feats)
            self.vocabulary.update(feats)
        self.is_trained = True
        return self

    def predict(self, text: str) -> Tuple[str, float, Dict[str, float]]:
        """
        Returns `(best_category, confidence_probability, top_probabilities)`.
        Combines Multinomial Naive Bayes log-posteriors with domain regex likelihood boosts.
        """
        if not self.is_trained:
            self.fit(MULTILINGUAL_TRAINING_CORPUS)

        feats = MultilingualFeatureExtractor.extract_classification_features(text)
        if not feats:
            return ("Other Civic Issues", 0.5, {"Other Civic Issues": 1.0})

        vocab_size = max(1, len(self.vocabulary))
        num_classes = len(CIVIC_CATEGORIES)
        log_scores: Dict[str, float] = {}

        regex_matches: set[str] = set()
        for category, pattern in KEYWORD_CATEGORY_PATTERNS:
            if pattern.search(text):
                regex_matches.add(category)

        feat_counts = Counter(feats)
        for category in CIVIC_CATEGORIES:
            prior = (self.class_doc_counts[category] + 1.0) / (self.total_docs + num_classes)
            score = math.log(prior)
            denom = self.class_total_features[category] + self.alpha * vocab_size
            cat_counter = self.class_feature_counts[category]

            for feat, cnt in feat_counts.items():
                if feat in self.vocabulary:
                    num = cat_counter.get(feat, 0) + self.alpha
                    score += cnt * math.log(num / denom)

            if category in regex_matches:
                score += 6.5

            log_scores[category] = score

        scale = 0.22
        scaled = {cat: val * scale for cat, val in log_scores.items()}
        max_log = max(scaled.values())
        exp_scores = {cat: math.exp(val - max_log) for cat, val in scaled.items()}
        total_exp = sum(exp_scores.values()) or 1.0
        probs = {cat: exp_scores[cat] / total_exp for cat in CIVIC_CATEGORIES}

        ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
        best_cat, best_prob = ranked[0]

        if not regex_matches and best_prob < 0.16:
            return ("Other Civic Issues", round(best_prob, 4), dict(ranked[:3]))

        return (best_cat, round(best_prob, 4), dict(ranked[:3]))


class CivicSeverityScorer:
    """
    Hybrid Deterministic Safety Policy + Linear Feature Urgency Scorer in Python.
    Guarantees Critical life-safety hazards are never downgraded by probabilistic noise.
    """

    URGENCY_WEIGHTS: Tuple[Tuple[re.Pattern[str], float], ...] = (
        (re.compile(r"\b(since\s*\d+\s*days|many\s*days|week|weeks|कई\s*दिनों|हफ्ते)\b", re.I), 0.8),
        (re.compile(r"\b(main\s*road|highway|market|bus\s*stand|metro|मुख्य\s*सड़क|बाजार)\b", re.I), 0.7),
        (re.compile(r"\b(children|elderly|senior|pregnant|बच्चे|बुजुर्ग)\b", re.I), 0.9),
        (re.compile(r"\b(minor|small|repaint|notice\s*board|inquiry|सामान्य|सूचना\s*बोर्ड)\b", re.I), -1.1),
    )

    def evaluate(
        self,
        text: str,
        suggested_priority: Optional[str] = None,
        suggested_reason: Optional[str] = None,
    ) -> Tuple[str, str]:
        for pattern, reason in CRITICAL_HAZARD_RULES:
            if pattern.search(text):
                return ("Critical", reason)

        for pattern, reason in HIGH_PRIORITY_RULES:
            if pattern.search(text):
                if suggested_priority == "Critical":
                    return ("Critical", suggested_reason or reason)
                return ("High", suggested_reason or reason)

        if suggested_priority in COMPLAINT_PRIORITIES:
            return (
                str(suggested_priority),
                suggested_reason
                or "Standard municipal SLA assessment based on reported civic impact.",
            )

        urgency_score = 1.0
        for pattern, weight in self.URGENCY_WEIGHTS:
            if pattern.search(text):
                urgency_score += weight

        if urgency_score >= 2.2:
            return (
                "High",
                "ML Urgency Scorer: Persistent issue on high-footfall public corridor (24-hour SLA).",
            )
        if urgency_score <= 0.2:
            return (
                "Low",
                "ML Urgency Scorer: General civic maintenance request (120-hour SLA).",
            )
        return (
            "Medium",
            "Standard neighborhood infrastructure maintenance priority (72-hour SLA).",
        )


class LocationEntityExtractor:
    """Extracts Indian street, sector, block, gate, market, or landmark clues from text."""

    LOCATION_PATTERNS: Tuple[re.Pattern[str], ...] = (
        re.compile(
            r"\b((?:sector|sec|ward|block|phase|pocket|gate|lane|gali)\s*[-#]?\s*[0-9a-zA-Z]+(?:\s+[a-zA-Z]+)?)",
            re.IGNORECASE,
        ),
        re.compile(
            r"\b((?:near|opposite|opp\.?|beside|behind|outside)\s+[A-Za-z0-9\s,.-]{3,42})",
            re.IGNORECASE,
        ),
        re.compile(
            r"([A-Za-z0-9]+\s+(?:Road|Marg|Market|Chowk|Nagar|Colony|Vihar|Enclave|Depot|Stage))",
            re.IGNORECASE,
        ),
        re.compile(
            r"([\u0900-\u097F0-9\s]{3,28}(?:रोड|मार्ग|मार्केट|चौक|नगर|कॉलोनी|सेक्टर|गली|के\s*पास))",
        ),
    )

    @classmethod
    def extract_hint(cls, text: str, fallback_locality: str = "") -> str:
        for pattern in cls.LOCATION_PATTERNS:
            match = pattern.search(text or "")
            if match:
                extracted = match.group(1).strip(" ,.-")
                if len(extracted) >= 4:
                    return extracted[:100]
        return fallback_locality or "Not specified in text"

    @staticmethod
    def detect_script_language(text: str, preferred_code: str = "hi") -> str:
        if re.search(r"[\u0980-\u09FF]", text):
            return "Bengali (বাংলা)"
        if re.search(r"[\u0A00-\u0A7F]", text):
            return "Punjabi (ਪੰਜਾਬੀ)"
        if re.search(r"[\u0B80-\u0BFF]", text):
            return "Tamil (தமிழ்)"
        if re.search(r"[\u0C00-\u0C7F]", text):
            return "Telugu (తెలుగు)"
        if re.search(r"[\u0900-\u097F]", text):
            if preferred_code == "mr" or re.search(r"(आहे|पाणी|रस्त्यावर|गटाराचे|नाही)", text):
                return "Marathi (मराठी)"
            return "Hindi (हिन्दी)"

        if re.search(
            r"\b(hai|nahi|paani|sadak|gaddha|kachra|bijli|khula|gayi|gaya|raha|mein|ke\s+paas)\b",
            text,
            re.IGNORECASE,
        ):
            return "Hinglish"

        names = {
            "hi": "Hindi (हिन्दी)",
            "en": "English",
            "hinglish": "Hinglish",
            "mr": "Marathi (मराठी)",
            "pa": "Punjabi (ਪੰਜਾਬੀ)",
            "ta": "Tamil (தமிழ்)",
            "bn": "Bengali (বাংলা)",
            "te": "Telugu (తెలుగు)",
        }
        return names.get(preferred_code, "English")


class SublinearTfidfBm25DuplicateRanker:
    """
    Ensemble Duplicate Complaint Clustering Model in Python.
    Combines:
    - Sublinear TF-IDF (`1 + log(tf)`) Cosine Similarity over words + character 3-grams
    - Okapi BM25 (`k1=1.5, b=0.75`) relevance normalized to [0, 1]
    - Word-level Jaccard Similarity
    Strictly scoped to active tickets in the same municipal locality or ward.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b

    @staticmethod
    def _cosine_tfidf(
        vec_a: Counter[str],
        vec_b: Counter[str],
        idf: Dict[str, float],
    ) -> float:
        if not vec_a or not vec_b:
            return 0.0

        weights_b: Dict[str, float] = {}
        norm_b = 0.0
        for term, cnt in vec_b.items():
            w = (1.0 + math.log(cnt)) * idf.get(term, 1.0)
            weights_b[term] = w
            norm_b += w * w

        dot = 0.0
        norm_a = 0.0
        for term, cnt in vec_a.items():
            w_a = (1.0 + math.log(cnt)) * idf.get(term, 1.0)
            norm_a += w_a * w_a
            w_b = weights_b.get(term)
            if w_b is not None:
                dot += w_a * w_b

        if norm_a <= 0.0 or norm_b <= 0.0:
            return 0.0
        return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))

    def _bm25_normalized(
        self,
        query_counter: Counter[str],
        doc_counter: Counter[str],
        idf: Dict[str, float],
        avg_dl: float,
    ) -> float:
        if not query_counter or not doc_counter:
            return 0.0

        doc_len = sum(doc_counter.values())
        score = 0.0
        max_possible = 0.0

        for term, q_cnt in query_counter.items():
            term_idf = idf.get(term, 1.0)
            q_weight = 1.0 + math.log(q_cnt)
            max_possible += term_idf * q_weight

            tf = doc_counter.get(term, 0)
            if tf > 0:
                denom = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / max(1.0, avg_dl)))
                bm25_tf = (tf * (self.k1 + 1.0)) / denom
                score += term_idf * q_weight * (bm25_tf / (self.k1 + 1.0))

        if max_possible <= 0.0:
            return 0.0
        return min(1.0, score / max_possible)

    def rank(
        self,
        locality: str,
        ward_code: Optional[str],
        description: str,
        interpreted_summary: str,
        candidates: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if not candidates:
            return []

        loc_norm = (locality or "").strip().lower()
        ward_norm = (ward_code or "").strip()

        filtered: List[Dict[str, Any]] = []
        for row in candidates:
            if row.get("duplicateOfTrackingCode"):
                continue
            row_loc = str(row.get("locality") or "").strip().lower()
            row_ward = str(row.get("wardCode") or "").strip()
            if (row_loc and row_loc == loc_norm) or (ward_norm and row_ward == ward_norm):
                filtered.append(row)

        if not filtered:
            return []

        query_tokens = MultilingualFeatureExtractor.extract_similarity_tokens(
            f"{description} {interpreted_summary} {locality}"
        )
        query_counter = Counter(query_tokens)
        query_words = {t for t in query_tokens if not t.startswith("#")}

        doc_counters: List[Counter[str]] = [query_counter]
        for row in filtered:
            cand_tokens = MultilingualFeatureExtractor.extract_similarity_tokens(
                f"{row.get('rawDescription', '')} {row.get('interpretedSummary', '')} {row.get('locality', '')}"
            )
            doc_counters.append(Counter(cand_tokens))

        total_docs = len(doc_counters)
        df: Counter[str] = Counter()
        for counter in doc_counters:
            for term in counter.keys():
                df[term] += 1

        idf: Dict[str, float] = {
            term: math.log((1.0 + total_docs) / (1.0 + freq)) + 1.0
            for term, freq in df.items()
        }
        avg_dl = sum(sum(c.values()) for c in doc_counters) / max(1, total_docs)

        scored: List[Dict[str, Any]] = []
        for idx, row in enumerate(filtered):
            cand_counter = doc_counters[idx + 1]
            cand_words = {t for t in cand_counter.keys() if not t.startswith("#")}

            cosine = self._cosine_tfidf(query_counter, cand_counter, idf)
            bm25 = self._bm25_normalized(query_counter, cand_counter, idf, avg_dl)
            union_size = len(query_words | cand_words)
            jaccard = len(query_words & cand_words) / max(1, union_size)

            ensemble_sim = 0.45 * cosine + 0.30 * bm25 + 0.25 * jaccard
            blended = 0.55 + ensemble_sim * 0.65
            final_score = min(0.98, round(blended, 2))

            if final_score >= 0.55:
                scored.append(
                    {
                        "trackingCode": str(row.get("trackingCode", "")),
                        "category": str(row.get("category", "")),
                        "locality": str(row.get("locality", "")),
                        "wardName": str(row.get("wardName", "")),
                        "interpretedSummary": str(row.get("interpretedSummary", "")),
                        "status": str(row.get("status", "Pending")),
                        "createdAt": str(row.get("createdAt", "")),
                        "similarityScore": final_score,
                    }
                )

        scored.sort(key=lambda item: float(item["similarityScore"]), reverse=True)
        return scored[:3]


_CIVIC_CLASSIFIER: Optional[MultilingualCivicNaiveBayes] = None
_SEVERITY_SCORER: Optional[CivicSeverityScorer] = None
_DUPLICATE_RANKER: Optional[SublinearTfidfBm25DuplicateRanker] = None


def get_civic_classifier() -> MultilingualCivicNaiveBayes:
    global _CIVIC_CLASSIFIER
    if _CIVIC_CLASSIFIER is None:
        _CIVIC_CLASSIFIER = MultilingualCivicNaiveBayes(alpha=0.65).fit(
            MULTILINGUAL_TRAINING_CORPUS
        )
    return _CIVIC_CLASSIFIER


def get_severity_scorer() -> CivicSeverityScorer:
    global _SEVERITY_SCORER
    if _SEVERITY_SCORER is None:
        _SEVERITY_SCORER = CivicSeverityScorer()
    return _SEVERITY_SCORER


def get_duplicate_ranker() -> SublinearTfidfBm25DuplicateRanker:
    global _DUPLICATE_RANKER
    if _DUPLICATE_RANKER is None:
        _DUPLICATE_RANKER = SublinearTfidfBm25DuplicateRanker(k1=1.5, b=0.75)
    return _DUPLICATE_RANKER
