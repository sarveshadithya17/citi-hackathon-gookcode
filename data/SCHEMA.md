# Knowledge base schema

Every file in `data/` is plain JSON (a list of records) so anyone can add a scheme,
course, exam, career or language by editing data, without touching code.
Each record carries `source_url` and `last_verified` (YYYY-MM-DD).

## Shared vocabularies

**education levels** (ordered):
`class8`, `class9`, `class10`, `class11`, `class12`, `iti`, `diploma`, `ug`, `pg`

**categories**: `general`, `ews`, `obc`, `bc`, `mbc`, `sc`, `st`, `minority`
(`bc`/`mbc` are Tamil Nadu state categories; `obc` is the central list.)

**interest tags** (use only these):
`biology`, `chemistry`, `physics`, `maths`, `computers`, `coding`, `drawing`, `music`,
`dance`, `sports`, `farming`, `animals`, `machines`, `electricity`, `vehicles`,
`cooking`, `sewing`, `fashion`, `beauty`, `teaching`, `helping_people`, `health`,
`business`, `selling`, `talking`, `writing`, `languages`, `law`, `nature`,
`building`, `photography`, `video`, `accounts`, `social_media`, `travel`,
`uniform_service`, `fitness`, `repair`, `crafts`, `environment`

**work styles**: `hands`, `people`, `computers`, `outdoors`, `creative`, `numbers`

## careers.json
```json
{
  "id": "lab_technician",
  "name": {"en": "Medical Lab Technician", "ta": "மருத்துவ ஆய்வக தொழில்நுட்பர்", "hi": "मेडिकल लैब तकनीशियन"},
  "category": "healthcare",
  "nco_code": "3212",
  "description": "Runs blood, urine and other tests in hospital and diagnostic labs.",
  "interests": ["biology", "chemistry", "health"],
  "work_styles": ["hands", "numbers"],
  "min_education": "class12",
  "stream_hint": "science_bio",
  "training_time": "2 years (DMLT)",
  "salary_inr_month": [12000, 30000],
  "cost_level": "low",
  "local_demand": "high",
  "pathway": [
    {"type": "education", "title": "Finish Class 12 with Biology", "duration": "1-2 years"},
    {"type": "course", "ref": "swayam_lab_safety", "title": "Free course: Basics of lab safety", "duration": "4 weeks"},
    {"type": "exam", "ref": "tn_paramedical", "title": "Apply for paramedical diploma admission", "duration": "1 month"},
    {"type": "education", "title": "DMLT diploma", "duration": "2 years"},
    {"type": "apprenticeship", "title": "Apprenticeship in a hospital or diagnostic lab (NAPS)", "duration": "6-12 months"},
    {"type": "job", "title": "Lab technician in a hospital or diagnostic chain", "duration": ""}
  ],
  "source_url": "https://www.ncs.gov.in/",
  "last_verified": "2026-10-18"
}
```
- `category`: one of `vocational`, `stem`, `non_stem`, `creative`, `government`,
  `entrepreneurship`, `healthcare`, `agriculture`.
- `stream_hint`: `science_bio`, `science_maths`, `commerce`, `arts`, `any`.
- `cost_level`: `free`, `low`, `medium`, `high`. `local_demand`: `low`, `medium`, `high`.
- `pathway[].type`: `education`, `course`, `exam`, `apprenticeship`, `job`, `practice`.
  `ref` (optional) must be an `id` in courses.json or exams.json.

## courses.json
```json
{
  "id": "swayam_lab_safety",
  "title": "Laboratory safety and good practices",
  "provider": "SWAYAM",
  "url": "https://swayam.gov.in/",
  "duration": "4 weeks",
  "languages": ["en"],
  "free": true,
  "level": "beginner",
  "interests": ["biology", "chemistry", "health"],
  "careers": ["lab_technician"],
  "source_url": "https://swayam.gov.in/",
  "last_verified": "2026-10-18"
}
```
`provider`: `SWAYAM`, `NPTEL`, `DIKSHA`, `Skill India Digital`, `PMKVY`, `NIOS`, `e-Skill India`, `Naan Mudhalvan`, `Other`.
Use the portal URL (or its search page) unless you are certain of the exact course URL.

## exams.json
```json
{
  "id": "neet_ug",
  "name": "NEET-UG",
  "conducted_by": "National Testing Agency (NTA)",
  "purpose": "Admission to MBBS, BDS, AYUSH and B.Sc Nursing seats",
  "min_education": "class12",
  "eligibility": "Class 12 with Physics, Chemistry, Biology; minimum age 17",
  "typical_month": "May",
  "fee_note": "Fee concession for SC/ST/PwD",
  "url": "https://neet.nta.nic.in/",
  "careers": ["doctor", "nurse"],
  "source_url": "https://neet.nta.nic.in/",
  "last_verified": "2026-10-18"
}
```

## scholarships.json and schemes.json
Same shape. `kind` is `scholarship` or `scheme`.
```json
{
  "id": "nmmss",
  "kind": "scholarship",
  "name": "National Means-cum-Merit Scholarship (NMMSS)",
  "provider": "Ministry of Education, Government of India",
  "level": "central",
  "benefit": "Rs 12,000 per year for Class 9 to 12",
  "summary": "For meritorious students from low-income families in government and aided schools.",
  "rules": {
    "education_levels": ["class8", "class9", "class10", "class11", "class12"],
    "categories": null,
    "max_family_income": 350000,
    "min_marks_percent": 55,
    "gender": null,
    "school_types": ["government", "aided"],
    "states": null,
    "min_age": null,
    "max_age": null,
    "disability": null,
    "first_graduate": null,
    "streams": null
  },
  "documents": ["Income certificate", "Class 7/8 marksheet", "Aadhaar or school ID", "Bank account details"],
  "how_to_apply": "Clear the state NMMS exam in Class 8, then register on the National Scholarship Portal.",
  "apply_url": "https://scholarships.gov.in/",
  "deadline_note": "NSP usually opens between July and October",
  "source_url": "https://scholarships.gov.in/",
  "last_verified": "2026-10-18"
}
```
Rules: `null` means "no restriction". Lists mean "must be one of". All present rules must pass.
`gender`: `female`, `male` or null. `school_types`: `government`, `aided`, `private`.
`states`: list of state names such as `"Tamil Nadu"`, or null for all-India.
`streams`: list from `science_bio`, `science_maths`, `commerce`, `arts`, `vocational`, or null.
`requires` (optional): a condition the engine can't check, as `{"en": "...", "ta": "...", "hi": "..."}`
(e.g. "you cleared the NMMS exam in Class 8"). Such records are shown as "you may qualify if ...".

## apprenticeships.json
Sample listings for the demo (seeded as employer opportunities). Mark them `"demo": true`.
```json
{
  "id": "appr_medlab_madurai",
  "kind": "apprenticeship",
  "org": "MedLab Diagnostics, Madurai",
  "title": "Lab assistant apprentice",
  "trade": "Medical Lab Technician",
  "district": "Madurai",
  "state": "Tamil Nadu",
  "stipend_inr_month": 9000,
  "duration": "12 months",
  "min_education": "class12",
  "interests": ["biology", "health"],
  "careers": ["lab_technician"],
  "naps": true,
  "demo": true,
  "apply_url": "https://www.apprenticeshipindia.gov.in/",
  "source_url": "https://www.apprenticeshipindia.gov.in/",
  "last_verified": "2026-10-18"
}
```
