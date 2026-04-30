# 🛠 Membership System Setup (Firebase)

To make the Login and Save functionality work on your live site, follow these free steps:

### 1. Create a Firebase Project
- Go to [Firebase Console](https://console.firebase.google.com/).
- Click **Add Project** and name it `Iraqi-Archive`.

### 2. Enable Authentication
- In the left sidebar, go to **Build > Authentication**.
- Click **Get Started** and enable **Email/Password**.

### 3. Enable Firestore Database
- Go to **Build > Firestore Database**.
- Click **Create Database**.
- Choose **Start in test mode** (for now) and pick a location near you.

### 4. Get Your API Keys
- Click the **Project Overview** (gear icon) > **Project Settings**.
- Scroll to **Your apps**, click the **Web icon (`</>`)**.
- Register the app name (e.g., `web-hub`).
- Copy the `firebaseConfig` object values.

### 5. Update Your Code
- Open [firebase-config.js](file:///d:/site/firebase-config.js) (not auth.js).
- Replace the placeholder values in the `firebaseConfig` object with your actual keys.

### 6. Pushing Live
- Once keys are replaced, run:
  ```powershell
  git add .
  git commit -m "Integrated Auth Keys"
  git push origin main
  ```
- Your site will now have a working Login and Library system!
