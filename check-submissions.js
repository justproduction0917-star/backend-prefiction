require('dotenv').config();
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI;
console.log('Connecting to MongoDB...');

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ MongoDB connected');
  
  const submissionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    company: { type: String },
    email: { type: String, required: true },
    message: { type: String },
    createdAt: { type: Date, default: Date.now }
  });
  
  const Submission = mongoose.model('Submission', submissionSchema);
  
  try {
    const submissions = await Submission.find().sort({ createdAt: -1 });
    console.log(`\n📊 Total Submissions: ${submissions.length}\n`);
    
    submissions.forEach((sub, index) => {
      console.log(`\n--- Submission ${index + 1} ---`);
      console.log(`Name: ${sub.name}`);
      console.log(`Email: ${sub.email}`);
      console.log(`Company: ${sub.company}`);
      console.log(`Message: ${sub.message}`);
      console.log(`Submitted: ${sub.createdAt}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error querying database:', err);
    process.exit(1);
  }
}).catch(err => {
  console.error('❌ Connection failed:', err);
  process.exit(1);
});
