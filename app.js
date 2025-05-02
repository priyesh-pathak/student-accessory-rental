const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use("/css", express.static(__dirname + "/css"));

app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: true,
  })
);

// GET login page
app.get("/", (req, res) => {
  res.render("login", { error: null });
});

// POST login
app.post("/login", (req, res) => {
  const { student_id, dob } = req.body;
  const sql = "SELECT * FROM students WHERE student_id = ? AND dob = ?";
  db.query(sql, [student_id, dob], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      req.session.student = results[0];
      res.redirect("/dashboard");
    } else {
      res.render("login", { error: "Invalid credentials" });
    }
  });
});

// Dashboard route
app.get("/dashboard", (req, res) => {
  if (!req.session.student) return res.redirect("/");

  const sql = "SELECT * FROM accessories";
  db.query(sql, (err, accessories) => {
    if (err) throw err;
    res.render("dashboard", {
      student: req.session.student,
      accessories: accessories,
    });
  });
});

// Rent an accessory
app.post("/rent", (req, res) => {
  if (!req.session.student) return res.redirect("/");

  const accessoryId = req.body.accessory_id;
  const studentId = req.session.student.student_id;

  const checkSql = "SELECT quantity, name FROM accessories WHERE id = ?";
  db.query(checkSql, [accessoryId], (err, result) => {
    if (err) throw err;
    if (result.length === 0 || result[0].quantity <= 0) {
      return res.send("Accessory not available.");
    }

    const itemName = result[0].name;

    const updateSql =
      "UPDATE accessories SET quantity = quantity - 1 WHERE id = ?";
    db.query(updateSql, [accessoryId], (err2) => {
      if (err2) throw err2;

      const insertSql =
        "INSERT INTO rentals (student_id, accessory_id) VALUES (?, ?)";
      db.query(insertSql, [studentId, accessoryId], (err3) => {
        if (err3) throw err3;

        res.render("rent", { itemName });
      });
    });
  });
});

// View My Rentals
app.get("/my-rentals", (req, res) => {
  if (!req.session.student) return res.redirect("/");

  const studentId = req.session.student.student_id;
  const sql = `
    SELECT r.id, r.rented_at, r.returned, r.returned_on, a.name
    FROM rentals r
    JOIN accessories a ON r.accessory_id = a.id
    WHERE r.student_id = ?
    ORDER BY r.rented_at DESC
  `;

  db.query(sql, [studentId], (err, rentals) => {
    if (err) throw err;
    res.render("myRentals", {
      student: req.session.student,
      rentals,
    });
  });
});

// Return accessory route
app.post("/return", (req, res) => {
  const rentalId = req.body.rental_id;
  const studentId = req.session.student.student_id;

  // Update the rental record to mark as returned
  const updateRentalSql = `
    UPDATE rentals 
    SET returned = 1, returned_on = NOW()
    WHERE id = ? AND student_id = ? AND returned = 0
  `;

  db.query(updateRentalSql, [rentalId, studentId], (err, result) => {
    if (err) throw err;

    // Check if the rental was updated successfully
    if (result.affectedRows > 0) {
      // Increase the quantity of the accessory in the accessories table
      const getAccessoryIdSql = `
        SELECT accessory_id FROM rentals WHERE id = ?
      `;
      db.query(getAccessoryIdSql, [rentalId], (err2, rows) => {
        if (err2) throw err2;

        const accessoryId = rows[0].accessory_id;

        const updateAccessorySql = `
          UPDATE accessories 
          SET quantity = quantity + 1 
          WHERE id = ?
        `;
        db.query(updateAccessorySql, [accessoryId], (err3) => {
          if (err3) throw err3;

          // Return a success message to the user
          const getItemNameSql = `
            SELECT a.name FROM accessories a 
            JOIN rentals r ON a.id = r.accessory_id 
            WHERE r.id = ?
          `;
          db.query(getItemNameSql, [rentalId], (err4, rows2) => {
            const itemName = rows2?.[0]?.name || "the item";
            res.render("return", { success: true, itemName });
          });
        });
      });
    } else {
      // If no rows were affected, the return failed
      res.render("return", { success: false, itemName: "" });
    }
  });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
