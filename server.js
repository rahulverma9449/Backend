require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const { ChatOpenAI } = require('@langchain/openai');
const {
  ChatPromptTemplate,
} = require('@langchain/core/prompts');
const getPrompt = require('./prompt');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const chatModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let chatContext = [];

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

app.get('/ping', (req, res) => {
  res.send('Server is live');
});

app.post(
  '/upload-resume',
  upload.single('resume'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    try {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(dataBuffer);
      const keywords = extractKeywords(data.text);

      chatContext.push({
        role: 'system',
        content: `${getPrompt(keywords)}`,
      });

      res.json({ keywords });
    } catch (error) {
      console.error('Error parsing PDF:', error);
      res.status(500).send('Error parsing PDF.');
    }
  }
);

app.post('/chat', async (req, res) => {
  const { message, resumeKeywords } = req.body;

  chatContext.push({
    role: 'user',
    content: message.toString(),
  });

  const messages = chatContext.map((chat) => [
    chat.role,
    chat.content,
  ]);
  const prompt = ChatPromptTemplate.fromMessages(messages);

  const chain = prompt.pipe(chatModel);

  try {
    const response = await chain.invoke({
      input:
        'Based on the previous chat we have done and the response of the user, ask a follow up question if they have not given the final correct and optimised ans or ask a new question.',
    });
    chatContext.push({
      role: 'system',
      content: response.content,
    });
    res.json({ response: response.content });
  } catch (error) {
    console.error('Error during chat:', error);
    res.status(500).send('Error during chat.');
  }
});

// Simple keyword extraction function
const extractKeywords = (text) => {
  const words = text.split(/\W+/);
  const frequency = {};
  words.forEach((word) => {
    if (word.length > 4) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  const sortedKeywords = Object.keys(frequency).sort(
    (a, b) => frequency[b] - frequency[a]
  );
  return sortedKeywords.slice(0, 10); // return top 10 keywords
};

app.listen(port, () => {
  console.log(
    `Server is running on http://localhost:${port}`
  );
});
