# Iraqi Archive — Modern Digital Vault

A premium, SaaS-inspired archival platform designed to preserve digital artifacts with a high-end research aesthetic. Built with Firebase v12 and a real-time reactive UI.

## 🚀 Key Features
- **Real-time Synchronized Archive**: Resources added by administrators appear instantly for all users via Firestore.
- **Identity & Vault**: Secure authentication system allowing users to save personal collections to their private "Digital Vault".
- **Admin Command Center**: Restricted dashboard for CRUD operations on the global archive registry.
- **Glassmorphism UI**: High-fidelity design system with dark/light mode support and neon accents.
- **Responsive Architecture**: Fully optimized for mobile, tablet, and desktop viewing.

## 🛠 Tech Stack
- **Frontend**: Vanilla HTML5, Tailwind CSS, Lucide Icons
- **Logic**: ES6+ JavaScript (Modular)
- **Backend & DB**: Firebase v12.10 (Auth & Firestore)
- **Deployment**: GitHub Pages (CI/CD optimized)

## 📁 Core Structure
- `index.html`: Main portal (Explore & Vault views)
- `admin.html`: Restriction-guarded administrative dashboard
- `auth.html`: Identity portal (Login, Signup, Recovery)
- `app.js`: Reactive application logic and state management
- `style.css`: Centralized design system and animations
- `color.css`: Theme tokens and color variables

## ⚙️ Setup & Deployment
1. **Firebase Init**: Follow the [SETUP_GUIDE.md](SETUP_GUIDE.md) to link your own Firebase project.
2. **Database Seeding**: Use the hidden `seed.html` tool as an admin to populate your database with initial artifacts.
3. **Live Sync**: Push to `main` to trigger GitHub Pages deployment.

## ⚖️ Security Path
Access to the `Vault Master` (Admin) portal is restricted via Firestore Security Rules to specifically authorized identities. See `firestore.rules` for the logic.
