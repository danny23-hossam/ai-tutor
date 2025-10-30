import React, { useState } from "react";
import "../App.css";
import "./Header.css";
import { useNavigate } from "react-router-dom";

const Header = () => {
  const navigate = useNavigate();
  const [darkmode, setdarkmode] = useState(false);
  const [logoutdiv, setlogoutdiv] = useState(false);

  const changemode = () => {
    setdarkmode(!darkmode);
    if (darkmode === false) {
      document.body.classList.add("darkmode");
      document.body.classList.remove("lightmode");
    }
    if (darkmode === true) {
      document.body.classList.add("lightmode");
      document.body.classList.remove("darkmode");
    }
  };

  const handlelogout = () => {
    setlogoutdiv(!logoutdiv);
  };

  return (
    <header className={`container-fluid header`}>
      <nav className="navbar navbar-expand-lg bg-body-tertiary">
        <div className="container-fluid ">
          <div className="papyrusdiv ">P</div>
          <a className="navbar-brand order-1 " href="#">
            Papyrus
          </a>

          <main className="main order-2 order-lg-4 ms-auto ">
            <button
              onClick={changemode}
              className={`btn btn-light me-2 iconsh `}
            >
              {darkmode ? "🌙" : "☀️"}
            </button>
            <div>
              <button className="headernameanddiv" onClick={handlelogout}>
                <div className="me-1 headernameab">DA</div>
                <p className="mb-0 headername ">danny</p>
              </button>

              {logoutdiv && (
                <div className="logoutdiv">
                  <div className="ldiv fluid-container">
                    <i class="bi bi-person iconh"></i>Profile
                  </div>
                  <div className="ldiv">
                    <i class="bi bi-gear iconh"></i>Settings
                  </div>
                  <hr className="line" />
                  <div className="ldiv">
                    <i class="bi bi-box-arrow-right iconh"></i>Signout
                  </div>
                </div>
              )}
            </div>
          </main>

          <button
            className="navbar-toggler order-3 order-lg-2"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarNav"
            aria-controls="navbarNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div
            className="collapse navbar-collapse order-4 order-lg-3"
            id="navbarNav"
          >
            <ul className="navbar-nav">
              <li className="nav-item">
                <a className="nav-link active" onClick={() => navigate("/")}>
                  <i className="bi bi-house-door"></i> Home
                </a>
              </li>
              <li className="nav-item">
                <a
                  className="nav-link active"
                  onClick={() => navigate("/mylearning")}
                >
                  <i className="bi bi-book"></i> My Learning
                </a>
              </li>

              <li className="nav-item">
                <a
                  className="nav-link active"
                  href="#"
                  onClick={() => navigate("/reminder")}
                >
                  <i class="bi bi-bell"></i> Reminders
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
