const express = require("express")
const app = express()
const path = require("path")
const fs = require("fs")
const bcrypt = require("bcrypt")
const multer = require("multer")

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "public/uploads")
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + "-" + uniqueSuffix + ext)
  },
})

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true)
  } else {
    cb(new Error("Not an image! Please upload only images."), false)
  }
}

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, 
  },
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))
app.set("view engine", "ejs")

const reviewFilePath = path.join(__dirname, "review.json")
const dataFilePath = path.join(__dirname, "data.json")
const listingsFilePath = path.join(__dirname, "listings.json")

if (!fs.existsSync(reviewFilePath)) {
  console.log("review.json not found. Creating a new file.")
  fs.writeFileSync(reviewFilePath, JSON.stringify([], null, 2), "utf8")
} else {
  console.log("review.json exists.")
}

if (!fs.existsSync(listingsFilePath)) {
  console.log("listings.json not found. Creating a new file.")
  fs.writeFileSync(listingsFilePath, JSON.stringify([], null, 2), "utf8")
} else {
  console.log("listings.json exists.")
}

let reviews = []
try {
  const reviewData = fs.readFileSync(reviewFilePath, "utf8")
  reviews = JSON.parse(reviewData)
  console.log("Reviews loaded from file.")
} catch (err) {
  console.error("Error loading reviews:", err)
}

let listings = []
try {
  const listingsData = fs.readFileSync(listingsFilePath, "utf8")
  listings = JSON.parse(listingsData)
  console.log("Listings loaded from file.")
} catch (err) {
  console.error("Error loading listings:", err)
}

let users = []
function loadUsers() {
  try {
    const userData = fs.readFileSync(dataFilePath, "utf8")
    users = JSON.parse(userData)
    console.log("Users loaded from file.")
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log("data.json not found. Creating a new file.")
      fs.writeFileSync(dataFilePath, JSON.stringify([], null, 2), "utf8")
    } else {
      console.error("Error loading user data:", err)
    }
  }
}

loadUsers()

app.get("/", (req, res) => {
  fs.readdir("./files", (err, files) => {
    if (err) {
      console.error("Error reading files directory:", err)
      res.status(500).send("Internal server error.")
      return
    }
    res.render("main.ejs", {
      files: files,
      reviews: reviews,
      listings: listings,
    })
  })
})

app.get("/seller", (req, res) => {
  res.render("seller", { listings: listings })
})

app.post("/add-listing", upload.single("productImage"), (req, res) => {
  try {
    const {
      sellerName,
      sellerEmail,
      sellerPhone,
      sellerAddress,
      sellerCity,
      sellerState,
      sellerPincode,
      productName,
      productBrand,
      productPrice,
      productOriginalPrice,
      productSize,
      productCondition,
      productDescription,
    } = req.body

    if (!sellerName || !sellerEmail || !sellerPhone || !productName || !productPrice) {
      return res.status(400).send("All required fields must be filled.")
    }

    const newListing = {
      _id: Date.now().toString(),
      seller: {
        name: sellerName,
        email: sellerEmail,
        phone: sellerPhone,
        address: sellerAddress,
        city: sellerCity,
        state: sellerState,
        pincode: sellerPincode,
      },
      name: productName,
      brand: productBrand,
      price: Number.parseFloat(productPrice),
      originalPrice: productOriginalPrice ? Number.parseFloat(productOriginalPrice) : null,
      size: productSize,
      condition: productCondition,
      description: productDescription,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : "/placeholder.svg?height=200&width=200",
      isNew: true,
      rating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
    }

    listings.push(newListing)

    fs.writeFile(listingsFilePath, JSON.stringify(listings, null, 2), "utf8", (err) => {
      if (err) {
        console.error("Error saving listing:", err)
        return res.status(500).send("Error saving listing.")
      }
      console.log("Listing saved successfully.")
      res.redirect("/seller")
    })
  } catch (error) {
    console.error("Error adding listing:", error)
    res.status(500).send("An error occurred while adding the listing.")
  }
})

app.post("/delete-listing", (req, res) => {
  const { listingId } = req.body

  if (!listingId) {
    return res.status(400).send("Listing ID is required.")
  }

  const listingToDelete = listings.find((listing) => listing._id === listingId)

  if (listingToDelete && listingToDelete.imageUrl && !listingToDelete.imageUrl.includes("placeholder")) {
    const imagePath = path.join(__dirname, "public", listingToDelete.imageUrl)
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath)
    }
  }

  listings = listings.filter((listing) => listing._id !== listingId)

  fs.writeFile(listingsFilePath, JSON.stringify(listings, null, 2), "utf8", (err) => {
    if (err) {
      console.error("Error saving listings after deletion:", err)
      return res.status(500).send("Error deleting listing.")
    }
    console.log(`Listing ${listingId} deleted successfully.`)
    res.redirect("/seller")
  })
})

app.post("/add-product", (req, res) => {
  const { name, description, price, imageUrl } = req.body

  if (!name || !description || !price || !imageUrl) {
    return res.status(400).send("All fields are required.")
  }

  const newProduct = {
    name,
    description,
    price: Number.parseFloat(price),
    imageUrl,
  }

  const productsFilePath = path.join(__dirname, "products.json")
  let products = []

  try {
    const productData = fs.readFileSync(productsFilePath, "utf8")
    products = JSON.parse(productData)
  } catch (err) {
    console.log("Error reading products file, will create a new one.")
  }

  products.push(newProduct)

  fs.writeFile(productsFilePath, JSON.stringify(products, null, 2), "utf8", (err) => {
    if (err) {
      console.error("Error saving product:", err)
      return res.status(500).send("Error saving product.")
    }
    console.log("Product saved successfully.")
    res.redirect("/")
  })
})

app.get("/login", (req, res) => {
  res.render("login")
})

app.get("/signup", (req, res) => {
  res.render("signup")
})

app.get("/admin", (req, res) => {
  res.render("admin", { users })
})

app.post("/submit-review", (req, res) => {
  const { name, comment, rating } = req.body

  if (name && comment && rating) {
    const newReview = {
      name: name,
      comment: comment,
      rating: Number.parseInt(rating),
    }

    reviews.push(newReview)

    fs.writeFile(reviewFilePath, JSON.stringify(reviews, null, 2), "utf8", (err) => {
      if (err) {
        console.error("Error saving reviews:", err)
        return res.status(500).send("Error saving review.")
      }
      console.log("Review saved successfully.")
      res.redirect("/")
    })
  } else {
    res.status(400).send("All fields are required.")
  }
})

app.post("/signup", async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).send("Error: Username and password are required.")
  }

  const existingUser = users.find((user) => user.name === username)

  if (existingUser) {
    return res.status(400).send("Error: User already exists. Please choose a different username.")
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = { name: username, password: hashedPassword }
    users.push(newUser)

    fs.writeFile(dataFilePath, JSON.stringify(users, null, 2), "utf8", (err) => {
      if (err) {
        console.error("Error writing to file:", err)
        return res.status(500).send(`Error: Could not save user data to file. Details: ${err.message}`)
      }
      console.log("User data written to file.")
      res.redirect("/login")
    })
  } catch (error) {
    console.error("Error hashing password:", error)
    return res.status(500).send("Error: Could not hash password.")
  }
})

app.post("/login", async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).send("Error: Username and password are required.")
  }

  const user = users.find((user) => user.name === username)

  if (!user) {
    return res.status(400).send("Error: User not found. Please check your username.")
  }

  try {
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return res.status(400).send("Error: Incorrect password.")
    }

    res.redirect("/")
  } catch (error) {
    console.error("Error comparing passwords:", error)
    return res.status(500).send("Error: Login failed due to an internal error.")
  }
})

app.post("/delete-user", (req, res) => {
  const { username } = req.body

  users = users.filter((user) => user.name !== username)

  fs.writeFile(dataFilePath, JSON.stringify(users, null, 2), "utf8", (err) => {
    if (err) {
      console.error("Error saving user data after deletion:", err)
      return res.status(500).send("Error deleting user.")
    }
    console.log(`User ${username} deleted successfully.`)
    res.redirect("/admin")
  })
})

app.listen(3002, () => {
  console.log("Running on http://localhost:3002")
})
