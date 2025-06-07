import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { URLSearchParams } from 'url';
import fetch from 'node-fetch';
import * as nodemailer from 'nodemailer';

@Injectable()
export class GeminiService {
  private readonly aiPersona = `You are a friendly and helpful customer support assistant for PA Energy, a solar panel installation company. 
  Your goal is to answer user questions about solar energy, our services (PA Energy), pricing, the installation process, and benefits.
  Company details: Name: PA Energy, Phone: +63 917 123 4567, Email: info@paenergy.ph. We use premium Trina solar panels.
  Consider the previous messages in the conversation when generating your responses.

   LEAD CAPTURE FLOW:
        1. After providing initial help or if the user seems interested in our services, ask them: "Would you be interested in getting a free, no-obligation assessment or learning more about how solar can benefit you?"
        2. If the user expresses interest (e.g., "yes", "I'm interested", "tell me more"), proceed to collect their details.
        3. Ask for details one by one:
           - "That's great to hear! To start, could I please get your full name?"
           - Once name is provided: "Thanks, [User's Name]! And what's your email address?"
           - Once email is provided: "Perfect. Lastly, your phone number please?"
           - Once phone is provided: "Got it! And any specific notes about your property or what you're looking for? (This is optional)"
        4. After gathering all details (name, email, phone, and optional notes), confirm them with the user: "Okay, just to confirm the details: Name: [Collected Name], Email: [Collected Email], Phone: [Collected Phone], Notes: [Collected Notes (or 'None' if not provided)]. Is that all correct?"
        5. If the user confirms (e.g., "yes", "correct"), THEN include the following special marker in your response (THIS MARKER IS FOR INTERNAL USE AND WILL BE HIDDEN FROM THE USER): [LEAD_DETAILS_COLLECTED name="[Collected Name]" email="[Collected Email]" phone="[Collected Phone]" notes="[Collected Notes (or empty string if none)"]
           Follow this marker IMMEDIATELY with a user-facing confirmation message like: "Excellent! I've passed your details to our team. We'll be in touch with you shortly at [Collected Email] or [Collected Phone]. Have a great day!"
        6. If the user wants to correct information, acknowledge and re-prompt for the specific piece of information or allow them to provide all details again. Then, re-confirm.
        7. If the user is not interested in providing details, politely end the lead capture attempt, e.g., "No problem at all! If you change your mind or have other questions, feel free to ask."
        
        Be concise and helpful. If you don't know an answer, say so. Do not make up information.
        Always be polite and professional.
    
    INQUIRY HANDLING:
      If the user asks about our services, pricing, or installation process, provide accurate and detailed information based on the following:

        PRICING:
          - 5KW system: Approximately 300,000 PHP, Outright payment or Bank loan (3-15 years).
          - 7.5KW system: Our most popular choice, approximately 450,000 PHP, Outright payment or Bank loan (3-15 years).
          - 10KW system: Ideal for larger homes, approximately 600,000 PHP, Outright payment or Bank loan (3-15 years).
          - 15KW system: Approximately 900,000 PHP, Outright payment or Bank loan (3-15 years).
        
        INSTALLATION PROCESS:
          1. Initial Consultation: We discuss your energy needs and assess your property.
          2. System Design: Our engineers design a custom solar system for your home.
          3. Permitting: We handle all necessary permits and approvals.
          4. Installation: Our certified technicians install the solar panels and equipment.
          5. Inspection: We conduct a final inspection to ensure everything is working properly.
          6. Activation: We activate your solar system and connect it to the grid.

      If the user asks about solar energy benefits, explain how solar can save money on electricity bills, reduce their carbon footprint, and increase their property value. Provide specific examples if possible.
      If the user asks about our solar panels, emphasize that we use premium Trina solar panels, which are known for their high efficiency, durability, and long lifespan.


    TRANSFER TO HUMAN AGENT:
      If the user requests to speak with a human agent, politely ask for their name, contact number, and email address so that a human agent can contact them. Follow this specific sequence:
        1. "I can connect you with a human agent. To start, could I please get your full name?"
        2. Once name is provided: "Thank you, [User's Name]! And what's your email address?"
        3. Once email is provided: "Perfect. Lastly, your phone number please?"
      After collecting the name, email, and phone number, respond with the following message including the special marker:
      "[HUMAN_AGENT_DETAILS name='[User's Name]' email='[User's Email]' phone='[User's Phone]'] Thank you! I'm connecting you to a human agent now. Please wait a moment."
        - Do a stall message like "Please hold on while I connect you to a human agent."
        - I'm sorry, all our agents are currently busy. Please hold on while I connect you to a human agent.

      If the user asks about our company, provide a brief overview of PA Energy, including our mission to provide affordable and sustainable solar energy solutions in the Philippines.
      
  `;
   
   

  private model: any;
  private leads: any[] = [];
  private readonly apiKey = 'AIzaSyBhg0F6UZwl1hb54M8q3R2fV3C3nmkrDtQ';
  private readonly LEAD_MARKER_REGEX = /\[LEAD_DETAILS_COLLECTED name="([^"]*)" email="([^"]*)" phone="([^"]*)" notes="([^"]*)"\]/;
  private readonly gmailUser = 'lfaderon@gmail.com';
  private readonly gmailPass = 'fzcmxffbmnmkrokb';
  private readonly conversations: Map<string, string[]> = new Map(); // Store conversation history

  constructor() {
    this.model = new GoogleGenerativeAI(this.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
  }

  async generateResponse(prompt: string): Promise<string> {
    const userId = 'default_user'; // Replace with a proper user ID if available
    let conversationHistory = this.conversations.get(userId) || [];

    conversationHistory.push(`User: ${prompt}`);

    const combinedPrompt = `${this.aiPersona}\n${conversationHistory.join('\n')}`;
    try {
      const result = await this.model.generateContent(combinedPrompt);
      const responseText = result.response.text();

      conversationHistory.push(`AI: ${responseText}`);
      this.conversations.set(userId, conversationHistory);

      const leadMatch = responseText.match(this.LEAD_MARKER_REGEX);
      const humanAgentMatch = responseText.match(/\[HUMAN_AGENT_DETAILS name='([^']*)' email='([^']*)' phone='([^']*)'\]/);

      if (leadMatch) {
        const [, name, collectedEmail, phone, notes] = leadMatch;
        const userFacingConfirmationFromGemini = responseText.replace(this.LEAD_MARKER_REGEX, "").trim();

        try {
          await this.sendEmail(name, collectedEmail, phone, notes);
          return `${userFacingConfirmationFromGemini} Is there anything else I can help you with, ${name}?`;
        } catch (apiError: any) {
          console.error('Error sending email via Nodemailer:', apiError);
          return `Great, I have your information: Name: ${name}, Email: ${collectedEmail}, Phone: ${phone}. Our team has been notified and will reach out to you soon. Thanks! Is there anything else I can help you with, ${name}?`;
        }
      } else if (humanAgentMatch) {
        const [, name, email, phone] = humanAgentMatch;
        try {
          await this.sendHumanAgentEmail(name, email, phone);
          return responseText.replace(/\[HUMAN_AGENT_DETAILS name='([^']*)' email='([^']*)' phone='([^']*)'\]/, "").trim();
        } catch (apiError: any) {
          console.error('Error sending human agent email via Nodemailer:', apiError);
          return "There was an error connecting you to a human agent. Please try again later.";
        }
      }

      return responseText;

    } catch (error: any) {
      console.error('Error generating content:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      return 'Sorry, I encountered an error while processing your request.';
    }
  }

  private processPrompt(prompt: string): string {
    // This method is no longer directly used, but kept for potential future use
    return `Okay, I understand. Let me see... ${prompt}`;
  }

  private async sendEmail(name: string, collectedEmail: string, phone: string, notes: string) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.gmailUser,
        pass: this.gmailPass,
      },
    });

    const mailOptions = {
      from: this.gmailUser,
      to: 'lfaderon@gmail.com',
      cc: 'muc@paenergy.ph',
      subject: 'PA Energy AI Assistant - Lead Alert',
      text: `A new lead has been captured by the PA Energy AI Assistant:\n\nDate: ${new Date().toLocaleString()}\nName: ${name}\nEmail: ${collectedEmail}\nPhone: ${phone}\nNotes: ${notes || "N/A"}\n\nPlease follow up with this lead.\nThe client's email for direct reply is: ${collectedEmail}.`,
      replyTo: collectedEmail,
    };

    await transporter.sendMail(mailOptions);
  }

  private async sendHumanAgentEmail(name: string, email: string, phone: string) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.gmailUser,
        pass: this.gmailPass,
      },
    });

    const mailOptions = {
      from: this.gmailUser,
      to: 'lfaderon@gmail.com',
      cc: 'muc@paenergy.ph',
      subject: 'PA Energy AI Assistant - Human Agent Transfer Request',
      text: `A user has requested to be transferred to a human agent:\n\nDate: ${new Date().toLocaleString()}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nPlease contact this user as soon as possible.`,
      replyTo: email,
    };

    await transporter.sendMail(mailOptions);
  }
}
