# Thiran: 3-minute demo script

Setup: run `./run.sh` and open http://localhost:8000 on a phone, or in Chrome with the device toolbar set to a phone. Use Chrome so voice works. The app opens in English; switch to தமிழ் or हिन्दी with the 🌐 picker in the top bar. All demo PINs are **1234**.

Before the demo, reset the data with `python -m backend.app.seed --reset`, then restart the server.

| Time | Screen | What to do and say |
|---|---|---|
| 0:00 | Login | "Meena is in Class 11 in a village near Madurai. No one has ever asked her what she is good at." On a first visit the guided tour points out each area; tap Next or Skip (or ? to replay). Switch to Tamil with 🌐. |
| 0:15 | **Kavya → Discover** | Log in as *Kavya R*. Tap 🎤 and say "நான் பத்தாம் வகுப்பு படிக்கிறேன்" ("I study in Class 10"). Thiran answers in Tamil and reads it aloud. Tap two interest chips, then ✅. Point out that it works by voice or by tapping, so low literacy is not a barrier. |
| 0:50 | **Meena → My careers** | Log out and log in as *Meena S*. The career list spans healthcare, agriculture, government, trades and teaching, each with a fit %, a "why it suits you" line in Tamil, salary and training time. Say: "Not just doctor or engineer." |
| 1:10 | **Lab Technician → path** | Show the steps built only from real catalogue items, with official links (SWAYAM, TN paramedical admissions, NAPS). Tick a step to add a badge to the Talent Passport. Tap "Make this my goal". |
| 1:30 | **Scholarships and jobs** | "You can get N scholarships and M schemes." Open one and show the ✅ reasons, the documents and the official Apply link. Tap 🔊 so the AI explains it in Tamil using only the record's facts. Show "Only if…" for conditions the rules can't verify. |
| 1:50 | **Offline** | Stop the server (or turn on airplane mode) and reload. The app still opens and the pathway is still there. Tick a step: "Saved on your phone". Bring the network back and it syncs (⏫). |
| 2:10 | **Teacher Raju** | Log in as *Raju K*. Show the weekly AI summary and insight cards ("Priya is eligible for N but hasn't applied"). Open Meena, endorse "Practical science", and recommend her to *MedLab Diagnostics*. Open Priya, who has no phone, and tap "Use Thiran for Priya". |
| 2:35 | **Employer MedLab** | Log in as the employer. Meena appears under applicants as "recommended by Raju K". In Find talent, filter by Madurai and endorsed students, then unlock the passport to show the teacher endorsements, first name only. Point out that contact goes through the teacher, and show the Impact tab. |
| 2:50 | Close | "Open source, any OpenAI-compatible model, new language = one JSON file. Students never pay; employers and CSR teams do." |

**Backup if the AI is rate-limited:** everything still works. Discover falls back to scripted questions, and careers fall back to rule-based reasons, so the demo never breaks. Adding a Groq key in `.env` gives an automatic second AI provider.
