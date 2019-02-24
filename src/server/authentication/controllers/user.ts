import { default as User, UserModel, AuthToken } from "../models/User";
import { Request, Response, NextFunction } from "express";
import * as passport from "passport";
import { IVerifyOptions } from "passport-local";
import "../config/passport";
import * as request from "express-validator";
const flash = require("express-flash");
import * as session from "express-session";
import * as pug from 'pug';

/**
 * GET /
 * Whenever a user navigates to the root of Dash
 * (doesn't specify a sub-route), redirect to login.
 */
export let getEntry = (req: Request, res: Response) => {
    res.redirect("/login");
}

/**
 * GET /signup
 * Directs user to the signup page
 * modeled by signup.pug in views
 */
export let getSignup = (req: Request, res: Response) => {
    if (req.user) {
        let user = req.user;
        console.log(user);
        return res.redirect("/home");
    }
    res.render("signup.pug", {
        title: "Sign Up",
        errors: req.flash("Unable to facilitate sign up. Please try again.")
    });
};

/**
 * POST /signup
 * Create a new local account.
 */
export let postSignup = (req: Request, res: Response, next: NextFunction) => {
    req.assert("email", "Email is not valid").isEmail();
    req.assert("password", "Password must be at least 4 characters long").len({ min: 4 });
    req.assert("confirmPassword", "Passwords do not match").equals(req.body.password);
    req.sanitize("email").normalizeEmail({ gmail_remove_dots: false });

    req.flash("Working on something!!!");

    const errors = req.validationErrors();

    if (errors) {
        res.render("signup.pug", {
            title: "Sign Up",
            errors: req.flash("Unable to facilitate sign up. Please try again.")
        });
        return res.redirect("/signup");
    }

    const email = req.body.email;
    const password = req.body.password;

    const user = new User({
        email,
        password
    });

    const please_work = "cool@gmail.com"

    User.findOne({ email }, (err, existingUser) => {
        if (err) { return next(err); }
        if (existingUser) {
            if (existingUser) {
                // existingUser.update({ $set: { email: please_work } }, (err, res) => { });
            }
            req.flash("errors", "Account with that email address already exists.");
            return res.redirect("/signup");
        }
        user.save((err) => {
            if (err) { return next(err); }
            req.logIn(user, (err) => {
                if (err) {
                    return next(err);
                }
                res.redirect("/");
            });
        });
    });

};


/**
 * GET /login
 * Login page.
 */
export let getLogin = (req: Request, res: Response) => {
    if (req.user) {
        return res.redirect("/home");
    }
    res.render("login.pug", {
        title: "Log In"
    });
};

/**
 * POST /login
 * Sign in using email and password.
 * On failure, redirect to login page
 */
export let postLogin = (req: Request, res: Response, next: NextFunction) => {
    req.assert("email", "Email is not valid").isEmail();
    req.assert("password", "Password cannot be blank").notEmpty();
    req.sanitize("email").normalizeEmail({ gmail_remove_dots: false });

    const errors = req.validationErrors();

    if (errors) {
        req.flash("errors", "Unable to login at this time. Please try again.");
        return res.redirect("/login");
    }

    passport.authenticate("local", (err: Error, user: UserModel, info: IVerifyOptions) => {
        if (err) { return next(err); }
        if (!user) {
            req.flash("errors", info.message);
            return res.redirect("/login");
        }
        req.logIn(user, (err) => {
            if (err) { return next(err); }
            req.flash("success", "Success! You are logged in.");
            res.redirect("/home");
        });
    })(req, res, next);
};

/**
 * GET /logout
 * Invokes the logout function on the request
 * and destroys the user's current session.
 */
export let getLogout = (req: Request, res: Response) => {
    req.logout();
    const sess = req.session;
    if (sess) {
        sess.destroy((err) => { if (err) { console.log(err); } });
    }
    res.redirect('/login');
}