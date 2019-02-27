import { default as User, DashUserModel, AuthToken } from "../models/user_model";
import { Request, Response, NextFunction } from "express";
import * as passport from "passport";
import { IVerifyOptions } from "passport-local";
import "../config/passport";
import * as request from "express-validator";
const flash = require("express-flash");
import * as session from "express-session";
import * as pug from 'pug';
import * as async from 'async';
import * as nodemailer from 'nodemailer';
import c = require("crypto");


/**
 * GET /
 * Whenever a user navigates to the root of Dash
 * (doesn't specify a sub-route), redirect to login.
 * If the user is already signed in, it will effectively
 * automatically redirect them to /home instead
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
        return res.redirect("/home");
    }
    res.render("signup.pug", {
        title: "Sign Up",
        user: req.user,
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

    const errors = req.validationErrors();

    if (errors) {
        res.render("signup.pug", {
            title: "Sign Up",
            user: req.user,
        });
        return res.redirect("/signup");
    }

    const email = req.body.email;
    const password = req.body.password;

    const user = new User({
        email,
        password,
        userDoc: "document here"
    });

    User.findOne({ email }, (err, existingUser) => {
        if (err) { return next(err); }
        if (existingUser) {
            return res.redirect("/login");
        }
        user.save((err) => {
            if (err) { return next(err); }
            req.logIn(user, (err) => {
                if (err) {
                    return next(err);
                }
                res.redirect("/home");
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
        title: "Log In",
        user: req.user
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
        return res.redirect("/signup");
    }

    passport.authenticate("local", (err: Error, user: DashUserModel, info: IVerifyOptions) => {
        if (err) { return next(err); }
        if (!user) {
            return res.redirect("/signup");
        }
        req.logIn(user, (err) => {
            if (err) { return next(err); }
            res.redirect("/home");
        });
    })(req, res, next);
};

export let getWorkspaces = (req: Request, res: Response) => {
    const user: DashUserModel = req.user;
    if (!user) {
        return res.redirect("/login");
    }
    res.render("workspace.pug", {
        ids: user.allWorkspaceIds
    });
}

/**
 * GET /logout
 * Invokes the logout function on the request
 * and destroys the user's current session.
 */
export let getLogout = (req: Request, res: Response) => {
    const dashUser: DashUserModel | undefined = req.user;
    if (dashUser) {
        dashUser.update({ $set: { didSelectSessionWorkspace: false } }, () => { })
    }
    req.logout();
    const sess = req.session;
    if (sess) {
        sess.destroy((err) => { if (err) { console.log(err); } });
    }
    res.redirect('/login');
}

export let getForgot = function (req: Request, res: Response) {
    res.render("forgot.pug", {
        title: "Recover Password",
        user: req.user,
    });
}

export let postForgot = function (req: Request, res: Response, next: NextFunction) {
    const email = req.body.email;
    async.waterfall([
        function (done: any) {
            let token: string;
            c.randomBytes(20, function (err: any, buffer: Buffer) {
                if (err) {
                    done(null);
                    return;
                }
                done(null, buffer.toString('hex'));
            })
        },
        function (token: string, done: any) {
            User.findOne({ email }, function (err, user: DashUserModel) {
                if (!user) {
                    // NO ACCOUNT WITH SUBMITTED EMAIL
                    return res.redirect('/forgot');
                }
                user.passwordResetToken = token;
                user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 HOUR
                user.save(function (err: any) {
                    done(null, token, user);
                });
            });
        },
        function (token: Uint16Array, user: DashUserModel, done: any) {
            const smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: 'brownptcdash@gmail.com',
                    pass: 'browngfx1'
                }
            });
            const mailOptions = {
                to: user.email,
                from: 'brownptcdash@gmail.com',
                subject: 'Dash Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                // req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
                done(null, err, 'done');
            });
        }
    ], function (err) {
        if (err) return next(err);
        res.redirect('/forgot');
    })
}

export let getReset = function (req: Request, res: Response) {
    User.findOne({ passwordResetToken: req.params.token, passwordResetExpires: { $gt: Date.now() } }, function (err, user: DashUserModel) {
        if (!user || err) {
            return res.redirect('/forgot');
        }
        res.render("reset.pug", {
            title: "Reset Password",
            user: req.user,
        });
    });
}

export let postReset = function (req: Request, res: Response) {
    async.waterfall([
        function (done: any) {
            User.findOne({ passwordResetToken: req.params.token, passwordResetExpires: { $gt: Date.now() } }, function (err, user: DashUserModel) {
                if (!user || err) {
                    return res.redirect('back');
                }

                req.assert("password", "Password must be at least 4 characters long").len({ min: 4 });
                req.assert("confirmPassword", "Passwords do not match").equals(req.body.password);

                if (req.validationErrors()) {
                    return res.redirect('back');
                }

                user.password = req.body.password;
                user.passwordResetToken = undefined;
                user.passwordResetExpires = undefined;

                user.save(function (err) {
                    if (err) {
                        return res.redirect("/login");
                    }
                    req.logIn(user, function (err) {
                        if (err) {
                            return;
                        }
                    });
                    done(null, user);
                });
            });
        },
        function (user: DashUserModel, done: any) {
            const smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: 'brownptcdash@gmail.com',
                    pass: 'browngfx1'
                }
            });
            const mailOptions = {
                to: user.email,
                from: 'brownptcdash@gmail.com',
                subject: 'Your password has been changed',
                text: 'Hello,\n\n' +
                    'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                done(null, err);
            });
        }
    ], function (err) {
        res.redirect('/login');
    });
}