const express = require('express')
const cors = require("cors");
const { MongoClient, ServerApiVersion,ObjectId } = require('mongodb');
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

app.get('/stats', async (req, res) => {
  try {
    // total movies (same as before)
    const totalMovies = await movieCollection.countDocuments();

    // attempt to count a 'users' collection if it exists
    const usersCollection = db.collection('users');
    let totalUsers = 0;
    try {
      totalUsers = await usersCollection.countDocuments();
    } catch (e) {
      console.warn('Could not count "users" collection directly:', e);
      totalUsers = 0;
    }

    // fallback 1: if totalUsers === 0, try distinct count based on addedBy in movies
    if (!totalUsers) {
      try {
        const distinctUsers = await movieCollection.distinct('addedBy', { addedBy: { $exists: true, $ne: null } });
        if (Array.isArray(distinctUsers)) {
          totalUsers = distinctUsers.length;
          console.log('Fallback: counted distinct "addedBy" in movies:', totalUsers);
        }
      } catch (e) {
        console.warn('Fallback distinct addedBy failed:', e);
      }
    }


    // return a clear, predictable shape
    const payload = { totalMovies, totalUsers };
    console.log('/stats payload ->', payload);
    return res.json(payload);
  } catch (err) {
    console.error('GET /stats error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


    // Add a new movie

app.post("/movies", async (req, res) => {
  try {
    const movie = { ...req.body };

    // Map legacy created_by -> addedBy
    if (movie.created_by && !movie.addedBy) {
      movie.addedBy = movie.created_by;
      delete movie.created_by;
    }

    // Map poster -> posterUrl (frontend might send 'poster' or 'posterUrl')
    if (movie.poster && !movie.posterUrl) {
      movie.posterUrl = movie.poster;
      delete movie.poster;
    }

    // Normalize numeric fields
    if (movie.rating !== undefined && movie.rating !== null && movie.rating !== "") {
      const r = Number(movie.rating);
      if (!Number.isNaN(r)) movie.rating = r;
      else delete movie.rating;
    }

    if (movie.releaseYear !== undefined && movie.releaseYear !== null && movie.releaseYear !== "") {
      const y = Number(movie.releaseYear);
      if (!Number.isNaN(y)) movie.releaseYear = y;
      else delete movie.releaseYear;
    }

    if (movie.duration !== undefined && movie.duration !== null && movie.duration !== "") {
      const d = Number(movie.duration);
      if (!Number.isNaN(d)) movie.duration = d;
      else delete movie.duration;
    }

    // Keep cast as a comma-separated string (your DB sample uses a string)
    if (Array.isArray(movie.cast)) {
      movie.cast = movie.cast.join(", ");
    } else if (typeof movie.cast === "string") {
      movie.cast = movie.cast.trim();
    }

    // Ensure addedAt is a BSON Date on the server for sorting/filtering
    if (movie.addedAt) {
      const dt = new Date(movie.addedAt);
      if (!Number.isNaN(dt.getTime())) movie.addedAt = dt;
      else movie.addedAt = new Date();
    } else {
      movie.addedAt = new Date();
    }

    const result = await movieCollection.insertOne(movie);
    return res.status(201).json({ success: true, insertedId: result.insertedId, item: movie });
  } catch (err) {
    console.error("POST /movies error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


    // Update an existing movie
app.put("/movies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id required" });

    const incoming = { ...req.body };

    // 1. Normalize Poster
    if (incoming.poster && !incoming.posterUrl) {
      incoming.posterUrl = incoming.poster;
      delete incoming.poster;
    }

    // 2. Normalize Numbers
    if (incoming.rating !== undefined && incoming.rating !== null && incoming.rating !== "") {
      incoming.rating = Number(incoming.rating);
    }
    if (incoming.releaseYear !== undefined && incoming.releaseYear !== null && incoming.releaseYear !== "") {
      incoming.releaseYear = Number(incoming.releaseYear);
    }

    // 3. Normalize Cast (Save as string to match your POST logic)
    if (Array.isArray(incoming.cast)) {
      incoming.cast = incoming.cast.join(", ");
    }

    const filter = { _id: new ObjectId(id) };
    const updateDoc = { $set: incoming };

    // Use updateOne for reliability
    const result = await movieCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "Movie not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Movie updated successfully",
      modifiedCount: result.modifiedCount 
    });

  } catch (err) {
    console.error("PUT /movies/:id error:", err);
    if (err?.name === "BSONTypeError" || /ObjectId/.test(err.message)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }
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

// --- EMERGENCY DEBUG START ---
const watchlistCollection = db.collection('watchlist');

// This is a test route. If this works, the 404 is gone.
app.get("/test-route", (req, res) => {
    res.send("Server is recognizing new routes!");
});

app.post("/watchlist", async (req, res) => {
    try {
        const item = req.body;
        const result = await watchlistCollection.insertOne(item);
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/watchlist", async (req, res) => {
    try {
        const email = req.query.email;
        const result = await watchlistCollection.find({ userEmail: email }).toArray();
        res.send(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/watchlist/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    // Check if the ID is valid before trying to use it
    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid ID format" });
    }

    const query = { _id: new ObjectId(id) };
    const result = await watchlistCollection.deleteOne(query);
    
    if (result.deletedCount === 1) {
        res.send({ success: true, message: "Deleted successfully" });
    } else {
        res.status(404).send({ success: false, message: "Movie not found in watchlist" });
    }
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// --- EMERGENCY DEBUG END ---
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

// --- USER COLLECTION SETUP ---
const usersCollection = db.collection('users');

app.post('/users', async (req, res) => {
  try {
    const user = req.body;

    const query = { email: user.email };
    const existingUser = await usersCollection.findOne(query);

    if (existingUser) {
      return res.send({ message: 'User already exists', insertedId: null });
    }

    const result = await usersCollection.insertOne(user);
    res.status(201).send(result);
  } catch (err) {
    console.error("POST /users error:", err);
    res.status(500).send({ error: "Failed to save user" });
  }
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

// GET /my-collection
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

// ===== ADD THESE ROUTES INSIDE run() AFTER movieCollection IS DEFINED =====


app.get('/stats', async (req, res) => {
  try {
    const totalMovies = await movieCollection.countDocuments();
    const usersCollection = db.collection('users');
    // if users collection doesn't exist this returns 0
    const totalUsers = await usersCollection.countDocuments();
    return res.json({ totalMovies, totalUsers });
  } catch (err) {
    console.error('GET /stats error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// TOP RATED -> top 5 movies with numeric rating (desc)
app.get('/top-rated', async (req, res) => {
  try {
    const limit = 5;
    const results = await movieCollection
      .find({ rating: { $type: 'number' } }) // ensure rating is numeric
      .sort({ rating: -1, releaseYear: -1 })
      .limit(limit)
      .toArray();
    return res.json(results);
  } catch (err) {
    console.error('GET /top-rated error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// RECENTLY ADDED -> latest 6 movies by addedAt, fallback to _id timestamp
app.get('/recently-added', async (req, res) => {
  try {
    const limit = 6;
    // sort by addedAt desc, then by _id desc (ObjectId contains timestamp)
    const results = await movieCollection
      .find({})
      .sort({ addedAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return res.json(results);
  } catch (err) {
    console.error('GET /recently-added error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
   
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Server is running well!')
})

app.listen(port, () => {
  console.log(`Server is  listening on port ${port}`)
})
