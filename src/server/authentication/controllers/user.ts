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
 * GET /signup
 * Signup page.
 */
export let getSignup = (req: Request, res: Response) => {
    if (req.user) {
        return res.redirect("/");
    }
    res.render("signup.pug", {
        title: "Sign Up"
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
        req.flash("errors", "Unable to facilitate sign up. Please try again.");
        console.log(errors.toString());
        return res.redirect("/signup");
    }

    const user = new User({
        email: req.body.email,
        password: req.body.password
    });

    User.findOne({ email: req.body.email }, (err, existingUser) => {
        if (err) { return next(err); }
        if (existingUser) {
            console.log("GAAAAHHHHHHH!");
            req.flash("errors", "Account with that email address already exists.");
            return res.redirect("/signup");
        }
        user.save((err) => {
            if (err) { return next(err); }
            req.logIn(user, (err) => {
                if (err) {
                    return next(err);
                }
                console.log("WE IN!");
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
        return res.redirect("/");
    }
    res.send("<p>dear lord please render</p>");
    // res.render("account/login", {
    //     title: "Login"
    // });
};

/**
 * POST /login
 * Sign in using email and password.
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
            res.redirect("/");
        });
    })(req, res, next);
};