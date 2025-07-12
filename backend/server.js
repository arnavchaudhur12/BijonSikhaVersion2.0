// 1. Import Dependencies
require('dotenv').config(); // Loads environment variables from a .env file
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');

// 2. Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// 3. Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // To parse JSON bodies from incoming requests

// 4. Connect to MongoDB Database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB!');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// 5. Define a Mongoose Schema and Model
const submissionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  message: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
});

const Submission = mongoose.model('Submission', submissionSchema);

// 6. Setup Nodemailer for sending emails
const transporter = nodemailer.createTransport({
  service: 'gmail', // Use 'gmail' or another service
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app-specific password
  },
});

// 7. Create the API Endpoint
app.post('/api/submit', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // --- Step A: Save to Database ---
    const newSubmission = new Submission({ name, email, phone, message });
    await newSubmission.save();
    console.log('Submission saved to database.');

    // --- Step B: Send Email Notification ---
    const mailOptions = {
      from: `"BijonSikha Website" <${process.env.EMAIL_USER}>`,
      to: 'customercare@bijonsikha.com', // The destination email
      subject: 'New Contact Form Submission',
      html: `
        <h2>New Inquiry from BijonSikha Website</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Email notification sent.');
    
    // --- Step C: Send Success Response to Front-end ---
    res.status(201).json({ success: true, message: 'Form submitted successfully!' });

  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({ success: false, message: 'An error occurred on the server.' });
  }
});

// 8. Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});