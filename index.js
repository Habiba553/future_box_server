const express = require('express')
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = 3000
app.use(cors())
app.use(express.json())


const uri = "mongodb+srv://movie-master:BVUgXB4zYid2yE2U@cluster0.o7z4zqh.mongodb.net/?appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
  
    const db = client.db('movie-master')
    const movieCollection = db.collection('movies')

        // Get all movies
   // Replace the existing app.get("/movies", ...) with this implementation
app.get("/movies", async (req, res) => {
  try {
    // parse query
    const {
      genres: genresQuery,
      minRating: minRatingQ,
      maxRating: maxRatingQ,
      language,
      country,
      sort,
      page: pageQ,
      limit: limitQ,
      search, // optional free-text search
    } = req.query;

    const page = Math.max(1, parseInt(pageQ, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitQ, 10) || 24));
    const skip = (page - 1) * limit;

    // build filter
    const filter = {};

    // genres (comma separated)
    if (genresQuery) {
      const genres = genresQuery.split(",").map((g) => g.trim()).filter(Boolean);
      if (genres.length) {
        // handle either string genre or array-of-genres
        filter.$or = [
          { genre: { $in: genres } },            // genre: "Action" OR genre: ["Action","Drama"]
          { genre: { $elemMatch: { $in: genres } } }, // fallback if stored as array-of-objects etc.
        ];
      }
    }

    // rating range
    const minRating = minRatingQ !== undefined ? Number(minRatingQ) : NaN;
    const maxRating = maxRatingQ !== undefined ? Number(maxRatingQ) : NaN;
    if (!isNaN(minRating) || !isNaN(maxRating)) {
      filter.rating = {};
      if (!isNaN(minRating)) filter.rating.$gte = minRating;
      if (!isNaN(maxRating)) filter.rating.$lte = maxRating;
      // remove empty
      if (Object.keys(filter.rating).length === 0) delete filter.rating;
    }

    if (language) filter.language = language;
    if (country) filter.country = country;

    // optional text search across title/genre/director
    if (search) {
      filter.$or = filter.$or || [];
      filter.$or.push(
        { title: { $regex: search, $options: "i" } },
        { genre: { $regex: search, $options: "i" } },
        { director: { $regex: search, $options: "i" } }
      );
    }

    // build sort
    let sortObj = {};
    switch (sort) {
      case "rating_desc":
        sortObj = { rating: -1 };
        break;
      case "rating_asc":
        sortObj = { rating: 1 };
        break;
      case "year_desc":
        sortObj = { releaseYear: -1 };
        break;
      case "recent":
      default:
        // if you keep a created/addedAt timestamp use that. Fallback to releaseYear desc.
        sortObj = { releaseYear: -1 };
    }

    // count total (for pagination UI)
    const total = await movieCollection.countDocuments(filter);

    // fetch paginated data
    const cursor = movieCollection.find(filter).sort(sortObj).skip(skip).limit(limit);
    const data = await cursor.toArray();

    // return consistent response
    return res.json({ data, total, page, limit });
  } catch (err) {
    console.error("GET /movies error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


    // Get a single movie by ID
    app.get("/movies/:id", async (req, res) => {
      const { ObjectId } = require("mongodb");
      const { id } = req.params;
      const result = await movieCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

// STATS ROUTE → returns totalMovies + totalUsers
app.get('/stats', async (req, res) => {
  try {
    const totalMovies = await movieCollection.countDocuments();

    // If you have a users collection
    const usersCollection = db.collection('users');
    const totalUsers = await usersCollection.countDocuments();

    res.json({ totalMovies, totalUsers });
  } catch (err) {
    console.error("GET /stats error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


    // Add a new movie
    app.post("/movies", async (req, res) => {
      const newMovie = req.body;
      const result = await movieCollection.insertOne(newMovie);
      res.send(result);
    });

    // Update an existing movie
    app.put("/movies/:id", async (req, res) => {
      const { ObjectId } = require("mongodb");
      const { id } = req.params;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const update = { $set: updatedData };
      const result = await movieCollection.updateOne(filter, update);
      res.send(result);
    });

    // Delete a movie
    app.delete("/movies/:id", async (req, res) => {
      const { ObjectId } = require("mongodb");
      const { id } = req.params;
      const result = await movieCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // DELETE /my-collection/:id  -> remove an item by its collection _id
app.delete('/my-collection/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id param required' });

    // ensure valid ObjectId
    let filter;
    try {
      filter = { _id: new ObjectId(id) };
    } catch (err) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const result = await myCollection.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    return res.json({ success: true, deletedCount: result.deletedCount, id });
  } catch (err) {
    console.error('DELETE /my-collection/:id error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

    // Get latest 6 movies
    app.get("/latest-movies", async (req, res) => {
      const result = await movieCollection.find().sort({ releaseYear: -1 }).limit(6).toArray();
      res.send(result);
    });

    // Get movies added by a specific user
    app.get("/my-movies", async (req, res) => {
      const email = req.query.email;
      const result = await movieCollection.find({ addedBy: email }).toArray();
      res.send(result);
    });

    // Search movies by title, genre, or director
    app.get("/search", async (req, res) => {
      const searchText = req.query.search || "";
      const result = await movieCollection.find({
        $or: [
          { title: { $regex: searchText, $options: "i" } },
          { genre: { $regex: searchText, $options: "i" } },
          { director: { $regex: searchText, $options: "i" } },
        ],
      }).toArray();
      res.send(result);
    });

    // inside run() after movieCollection is defined

const myCollection = db.collection('my-collection'); // new collection for user's saved movies

// POST /my-collection  -> add item to user's collection
app.post('/my-collection', async (req, res) => {
  try {
    const item = req.body;
    if (!item || !item.movieId || !item.addedBy) {
      return res.status(400).json({ error: 'movieId and addedBy (user email) are required' });
    }

    // add metadata
    item.addedAt = new Date().toISOString();

    const result = await myCollection.insertOne(item);
    // return 201 Created and created doc id and item
    return res.status(201).json({ success: true, insertedId: result.insertedId, item });
  } catch (err) {
    console.error('POST /my-collection error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /my-collection?email=...  -> list user collection (used by frontend)
// GET /my-collection?email=...&genres=Action,Drama&minRating=4&maxRating=9
app.get('/my-collection', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    // optional advanced filters
    const genresQuery = req.query.genres; // comma-separated string, e.g. 'Action,Drama'
    const minRating = req.query.minRating !== undefined ? Number(req.query.minRating) : undefined;
    const maxRating = req.query.maxRating !== undefined ? Number(req.query.maxRating) : undefined;

    const genres = genresQuery
      ? genresQuery.split(',').map((g) => g.trim()).filter(Boolean)
      : null;

    // Build aggregation pipeline
    const pipeline = [];

    // 1) only items for this user
    pipeline.push({ $match: { addedBy: email } });

    // 2) lookup movie document from `movies` collection using movieId (string -> ObjectId)
    pipeline.push({
      $lookup: {
        from: 'movies',
        let: { mId: '$movieId' },
        pipeline: [
          // attempt to match by converting movieId string to ObjectId (works if movieId is a stringified ObjectId)
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$_id', { $toObjectId: '$$mId' }] },
                  { $eq: ['$_id', '$$mId'] }, // in case movieId is stored directly as ObjectId already
                  { $eq: ['$_id', { $convert: { input: '$$mId', to: 'objectId', onError: null, onNull: null } }] }
                ],
              },
            },
          },
          // project only required fields for filtering and UI
          { $project: { genre: 1, rating: 1, title: 1, releaseYear: 1 } },
        ],
        as: 'movieDoc',
      },
    });

    // 3) unwind movieDoc so we can reference its fields (keep documents even if lookup fails)
    pipeline.push({
      $unwind: {
        path: '$movieDoc',
        preserveNullAndEmptyArrays: true,
      },
    });

    // 4) optional server-side filter stage
    const andConditions = [];

    if (genres && genres.length) {
      // match where movieDoc.genre (string or array) contains any of provided genres
      andConditions.push({
        $or: [
          { 'movieDoc.genre': { $in: genres } },
          // in case genre stored inside an array of objects or other shapes, this is a fallback:
          { 'movieDoc.genre': { $elemMatch: { $in: genres } } },
        ],
      });
    }

    if (!isNaN(minRating)) {
      andConditions.push({ 'movieDoc.rating': { $gte: minRating } });
    }

    if (!isNaN(maxRating)) {
      andConditions.push({ 'movieDoc.rating': { $lte: maxRating } });
    }

    if (andConditions.length > 0) {
      pipeline.push({ $match: { $and: andConditions } });
    }

    // optionally you can sort by addedAt descending
    pipeline.push({ $sort: { addedAt: -1 } });

    const items = await myCollection.aggregate(pipeline).toArray();

    return res.json(items);
  } catch (err) {
    console.error('GET /my-collection (advanced) error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});





    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Server is running well!')
})

app.listen(port, () => {
  console.log(`Server is  listening on port ${port}`)
})