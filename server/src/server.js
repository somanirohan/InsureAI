const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

const config = require('./config/config');
const connectDB = require('./config/db');
const { initChroma } = require('./config/chroma');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const ragService = require('./services/ragService');
const Conversation = require('./models/Conversation');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Connect Databases
connectDB();
initChroma();

// Middlewares
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve uploaded policy files statically
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Mount API routes
app.use('/api', routes);

// Error Handling Middleware
app.use(errorHandler);

// WebSocket Server for Streaming Chat (Architecture Component)
const wss = new WebSocketServer({ server, path: '/ws/chat' });

wss.on('connection', (ws, req) => {
  console.log('[WebSocket] Client connected for streaming chat');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { token, question, policy_id, conversation_id, plain_language_mode } = data;

      if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication token required' }));
        return;
      }

      let decoded;
      try {
        decoded = jwt.verify(token, config.JWT_SECRET);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
        return;
      }

      const userId = decoded.id;

      // Stream thinking / retrieval phase
      ws.send(JSON.stringify({ type: 'status', message: 'Classifying query & searching policy facts...' }));

      const ragResponse = await ragService.answerQuestion({
        userId,
        policyId: policy_id,
        question,
        plainLanguageRequested: !!plain_language_mode,
      });

      // Stream token chunks for realistic streaming UX
      const answer = plain_language_mode ? ragResponse.plainLanguage : ragResponse.answer;
      const words = answer.split(' ');

      for (let i = 0; i < words.length; i++) {
        ws.send(
          JSON.stringify({
            type: 'chunk',
            token: words[i] + ' ',
            isFirst: i === 0,
            isLast: i === words.length - 1,
          })
        );
        await new Promise((r) => setTimeout(r, 20)); // simulated token stream delay
      }

      // Stream final metadata (citations, confidence, verification)
      ws.send(
        JSON.stringify({
          type: 'complete',
          queryType: ragResponse.queryType,
          confidenceLevel: ragResponse.confidenceLevel,
          verificationPassed: ragResponse.verificationPassed,
          verificationNotes: ragResponse.verificationNotes,
          citations: ragResponse.citations,
        })
      );
    } catch (err) {
      console.error('[WebSocket] Error processing message:', err);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

// Start Server
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(` MedShield Backend Server Running on port ${PORT}`);
  console.log(` Environment: ${config.NODE_ENV}`);
  console.log(` API Endpoint: http://localhost:${PORT}/api`);
  console.log(` WebSocket:    ws://localhost:${PORT}/ws/chat`);
  console.log(`========================================================\n`);
});
