const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;
// const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

// Middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.wbbieaf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('Blood_donateDb');
    const userCollection = db.collection('users');
    const donationCollection = db.collection('donationRequests');

    app.get('/users', async (req, res) => {
      const query = req.query;

      const cursor = userCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post('/user', async (req, res) => {
      const { name, email, avatar, bloodGroup, district, upazila } = req.body;

      const existingUser = await userCollection.findOne({ email });

      if (existingUser) {
        return res.send({ message: 'user already exists' });
      }

      const userData = {
        name,
        email,
        avatar,
        bloodGroup,
        district,
        upazila,
        role: 'donor',
        status: 'active',
        createdAt: new Date(),
      };

      const result = await userCollection.insertOne(userData);
      res.send(result);
    });

    // Get user role by email
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email;

      const user = await userCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ role: 'donor' });
      }

      res.send({ role: user.role });
    });

    // Update user role

    // Update user role (donor → admin/volunteer, admin → volunteer, volunteer → admin)
    app.patch('/admin/users/role/:id', async (req, res) => {
      try {
        const userId = req.params.id;
        const { role: newRole } = req.body;

        // Allowed roles
        if (!['donor', 'volunteer', 'admin'].includes(newRole)) {
          return res.status(400).send({ message: 'Invalid role' });
        }

        // Find the user
        const user = await userCollection.findOne({
          _id: new ObjectId(userId),
        });
        if (!user) return res.status(404).send({ message: 'User not found' });

        // Update the role
        await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: newRole } }
        );

        res.send({ success: true, message: `Role updated to ${newRole}` });
      } catch (error) {
        console.error('Role update error:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // PATCH /user/:email
    app.patch('/user/:email', async (req, res) => {
      const email = req.params.email;
      const { displayName, district, upazila, bloodGroup, photoURL } = req.body;

      const update = { displayName, district, upazila, bloodGroup, photoURL };

      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: update }
        );
        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Update failed' });
      }
    });

    //=================================================================//

    // Create donation request
    app.post('/donation-request', async (req, res) => {
      try {
        const donationData = req.body;

        donationData.status = 'pending';
        donationData.createdAt = new Date();

        const result = await donationCollection.insertOne(donationData);

        res.send({
          success: true,
          message: 'Donation request created',
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to create donation request' });
      }
    });

    // ================== GET MY DONATION REQUESTS ==================

    app.get('/donation-request', async (req, res) => {
      try {
        const { email, status, page = 1, limit = 10 } = req.query;

        if (!email) {
          return res.status(400).send({ message: 'Email is required' });
        }

        const query = { requesterEmail: email };
        if (status) query.status = status;

        const skip = (page - 1) * limit;

        const requests = await donationCollection
          .find(query)
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .toArray();

        const total = await donationCollection.countDocuments(query);

        res.send({ requests, total });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to load donation requests' });
      }
    });

    // ================== DELETE DONATION REQUEST ==================
    app.delete('/donation-request/:id', async (req, res) => {
      const id = req.params.id;

      const result = await donationCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({ success: true, result });
    });

    // ================== UPDATE DONATION STATUS ==================
    app.patch('/donation-request/status/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.send({ success: true, result });
    });

    // CONFIRM DONATION (donor accepts request)
    app.patch('/donation-request/confirm/:id', async (req, res) => {
      const { id } = req.params;
      const { donorName, donorEmail } = req.body;

      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: 'inprogress',
            donorName,
            donorEmail,
          },
        }
      );

      res.send({ success: true, result });
    });

    // GET /donation-requests/pending
    app.get('/donation-requests/pending', async (req, res) => {
      try {
        const pendingRequests = await donationCollection
          .find({ status: 'pending' })
          .sort({ createdAt: -1 }) // latest first
          .toArray();

        res.send({ success: true, requests: pendingRequests });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to load pending requests' });
      }
    });

    // Get all donation requests (optional, admin)
    app.get('/donation-requests', async (req, res) => {
      const cursor = donationCollection.find({});
      const result = await cursor.toArray();
      res.send(result);
    });

    //-----------------------------------------------------//

    // SEARCH DONORS
    app.get('/users/donors', async (req, res) => {
      try {
        const { bloodGroup, district, upazila } = req.query;

        const query = { role: 'donor', status: 'active' };

        if (bloodGroup) query.bloodGroup = bloodGroup;
        if (district) query.district = district;
        if (upazila) query.upazila = upazila;

        const donors = await userCollection.find(query).toArray();
        res.send(donors);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to load donors' });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Blood Connection Successfully Complete');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
