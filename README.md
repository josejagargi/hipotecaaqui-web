🏢 Hipoteca Aquí — Web
Professional repository for the Hipoteca Aquí website.

📂 Project Structure
public/: Contains the static files (HTML, CSS, JS, images) deployed on Netlify.

netlify/functions/: Serverless functions for Airtable integration.

AIRTABLE_SCHEMA.md: Technical documentation for field mapping.

TOKENS SAVINGS: 
1. The language of this project is english
2. 🚫 DO NOT USE THE BROWSER IN THE PROJECT

🚀 Deployment
The site deploys automatically to Netlify every time a push is made to the main branch.

Staging URL: https://hipotecaaqui-draft-javi.netlify.app/

Production URL (Future redirect): https://hipotecaaqui.com

💻 Local Development
To test Netlify functions locally, run the following command in your terminal:

Bash
netlify dev
👥 User Types
The system manages two distinct user profiles:

1. Clients
Access: Can view their mortgage status in real time.

Unregistered users: Must be prompted by the website to complete a credit scoring process in order to register.

2. Associates
Access: Can monitor the status of their own mortgages as well as those of their client portfolio.

Unregistered users: Must receive a formal invitation to become associates; once accepted, they will gain access to the platform services.