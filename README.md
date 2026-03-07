# Brynsa Portal

Modern signup portal for Brynsa LinkedIn Lead Extractor Chrome Extension.

## Features

- 🔐 **Email OTP Authentication** - Secure passwordless login
- 🔑 **Google OAuth** - One-click Google sign-in
- 📋 **Multi-step Onboarding** - Company, role, team size, use case questionnaire
- 📊 **Dashboard** - User stats, usage tracking, feature access
- 🔄 **Extension Sync** - Auto-sync auth state with Chrome extension
- 🎨 **Modern UI** - Apollo-inspired dark theme with Tailwind CSS

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- React Router (Hash-based for GitHub Pages)
- Lucide Icons

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment to GitHub Pages

### Automatic Deployment

1. Push to `main` branch triggers automatic deployment via GitHub Actions
2. Site deploys to: `https://YOUR_USERNAME.github.io/brynsa-portal/`

### Manual Setup

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/brynsa-portal.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: GitHub Actions
   - Wait for deployment to complete

3. **Set Environment Variables** (Optional)
   - Go to repository Settings → Secrets and variables → Actions → Variables
   - Add `VITE_API_URL` with your backend URL (e.g., `https://your-backend.onrender.com`)

### Update Base URL

If your repository name is different, update `vite.config.js`:

```js
base: process.env.NODE_ENV === 'production' ? '/YOUR_REPO_NAME/' : '/',
```

## Backend Integration

The portal expects these API endpoints:

```
POST /api/auth/send-otp     - Send OTP to email
POST /api/auth/verify-otp   - Verify OTP and get JWT
POST /api/auth/google       - Google OAuth login
GET  /api/user/profile      - Get user profile
GET  /api/user/features     - Get user features and usage
POST /api/user/onboarding   - Save onboarding data
```

## Extension Integration

The portal stores auth state in localStorage for extension sync:

```js
// Auth data stored at:
localStorage.getItem('brynsa_token')  // JWT token
localStorage.getItem('brynsa_user')   // User object
localStorage.getItem('brynsa_auth')   // Combined auth data for extension

// Extension can listen for changes:
window.addEventListener('storage', (e) => {
  if (e.key === 'brynsa_token') {
    // Handle auth change
  }
});
```

## Project Structure

```
brynsa-portal/
├── src/
│   ├── components/       # Reusable components
│   │   └── ProtectedRoute.jsx
│   ├── context/          # React context providers
│   │   └── AuthContext.jsx
│   ├── pages/            # Page components
│   │   ├── LandingPage.jsx
│   │   ├── SignupPage.jsx
│   │   ├── LoginPage.jsx
│   │   └── DashboardPage.jsx
│   ├── utils/            # Utilities
│   │   ├── api.js        # API client
│   │   └── config.js     # Configuration
│   ├── App.jsx           # Main app with routing
│   ├── main.jsx          # Entry point
│   └── index.css         # Tailwind styles
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions deployment
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Customization

### Colors

Edit `tailwind.config.js` to change the brand colors:

```js
colors: {
  brynsa: {
    400: '#4ade80', // Primary green
    500: '#22c55e',
    600: '#16a34a',
  }
}
```

### Logo

Replace the Linkedin icon with your logo in the components.

## License

MIT
