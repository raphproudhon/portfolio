document.addEventListener("DOMContentLoaded", () => {

    /* =========================
       ELEMENTS
    ========================= */

    const agePopup = document.getElementById("agePopup");
    const yesAge = document.getElementById("yesAge");
    const noAge = document.getElementById("noAge");

    const loader = document.querySelector(".loader");
    const header = document.querySelector(".header");
    const hero = document.querySelector(".hero");


    /* =========================
       COOKIE AGE
    ========================= */

    function setAgeCookie() {
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1); // durée 1 an
        document.cookie = "ageVerified=true; expires=" + date.toUTCString() + "; path=/";
    }

    function getAgeCookie() {
        return document.cookie.split("; ").includes("ageVerified=true");
    }


    /* =========================
       LOADER (basé sur une classe CSS)
    ========================= */

    function hideLoader() {
        if (!loader) return;
        loader.classList.add("hide");
    }

    function showLoaderThenHide() {
        if (!loader) return;
        loader.classList.remove("hide");
        setTimeout(hideLoader, 1500);
    }


    /* =========================
       VERIFICATION AGE
    ========================= */

    function unlockSite() {
        document.body.classList.remove("age-lock");
        if (agePopup) agePopup.classList.add("hide");
    }

    if (agePopup) {
        if (getAgeCookie()) {
            // Visiteur déjà vérifié : pas de popup, mais on laisse
            // l'animation du loader se jouer avant de le masquer.
            unlockSite();
            agePopup.style.display = "none";
            showLoaderThenHide();
        } else {
            // Premier passage : le site est verrouillé, le loader
            // reste caché tant que la popup d'âge est affichée
            // (il est de toute façon masqué derrière elle).
            document.body.classList.add("age-lock");
            hideLoader();
        }

        if (yesAge) {
            yesAge.addEventListener("click", () => {
                setAgeCookie();
                unlockSite();
                showLoaderThenHide(); // petite animation de bienvenue après validation
            });
        }

        if (noAge) {
            noAge.addEventListener("click", () => {
                window.location.href = "https://www.google.com";
            });
        }
    } else {
        // Pages sans popup d'âge : le loader suit son cycle normal.
        if (loader) setTimeout(hideLoader, 1500);
    }


    /* =========================
       HEADER + PARALLAX
       (un seul listener scroll, throttlé via rAF)
    ========================= */

    let ticking = false;

    function onScroll() {
        const scrollY = window.scrollY;

        if (header) {
            header.classList.toggle("scrolled", scrollY > 80);
        }

        if (hero) {
            hero.style.backgroundPositionY = scrollY * 0.5 + "px";
        }

        ticking = false;
    }

    window.addEventListener("scroll", () => {
        if (!ticking) {
            window.requestAnimationFrame(onScroll);
            ticking = true;
        }
    }, { passive: true });

    onScroll(); // état initial du header au chargement


    /* =========================
       FORMULAIRE DE CONTACT
       -> Pas de backend connecté pour l'instant :
          on empêche juste le rechargement de page
          et on affiche une confirmation.
          À remplacer par un vrai envoi (API, Formspree,
          Netlify Forms...) quand le backend sera prêt.
    ========================= */

    const contactForm = document.getElementById("contactForm");

    if (contactForm) {
        contactForm.addEventListener("submit", (e) => {
            e.preventDefault();
            alert("Merci pour votre message ! Notre équipe vous répondra rapidement.");
            contactForm.reset();
        });
    }


    /* =========================
       ANIMATIONS SCROLL (IntersectionObserver)
    ========================= */

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    const sections = document.querySelectorAll(
        ".intro-text, .intro-image, .terroir-content, .card, .experience div, " +
        ".story-text, .story-image, .savoir-card, .cepage-card"
    );

    sections.forEach(section => {
        section.classList.add("hidden");
        observer.observe(section);
    });


    /* =========================
       ANIMATION DES CARTES (délai en cascade)
    ========================= */

    const cards = document.querySelectorAll(".card");

    cards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 150}ms`;
    });


    /* =========================
       MENU MOBILE (hamburger)
    ========================= */

    const navToggle = document.getElementById("navToggle");
    const mainNav = document.getElementById("mainNav");

    if (navToggle && mainNav) {
        function closeNav() {
            document.body.classList.remove("nav-open");
            navToggle.setAttribute("aria-expanded", "false");
            navToggle.setAttribute("aria-label", "Ouvrir le menu");
        }

        navToggle.addEventListener("click", () => {
            const open = document.body.classList.toggle("nav-open");
            navToggle.setAttribute("aria-expanded", open ? "true" : "false");
            navToggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
        });

        // Fermer le menu quand on clique un lien
        mainNav.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", closeNav);
        });

        // Fermer avec la touche Échap
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeNav();
        });
    }

});
