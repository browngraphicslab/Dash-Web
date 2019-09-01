import * as passport from 'passport';
import * as passportLocal from 'passport-local';
import _ from "lodash";
import { default as User } from '../models/user_model';
import { Request, Response, NextFunction } from "express";
import { RouteStore } from '../../RouteStore';

const LocalStrategy = passportLocal.Strategy;

passport.serializeUser<any, any>((user, done) => {
    done(undefined, user.id);
});

passport.deserializeUser<any, any>((id, done) => {
    User.findById(id, (err, user) => {
        done(err, user);
    });
});

// AUTHENTICATE JUST WITH EMAIL AND PASSWORD
passport.use(new LocalStrategy({ usernameField: 'email', passReqToCallback: true }, (req, email, password, done) => {
    User.findOne({ email: email.toLowerCase() }, (error: any, user: any) => {
        if (error) return done(error);
        if (!user) return done(undefined, false, { message: "Invalid email or password" }); // invalid email
        user.comparePassword(password, (error: Error, isMatch: boolean) => {
            if (error) return done(error);
            if (!isMatch) return done(undefined, false, { message: "Invalid email or password" }); // invalid password
            // valid authentication HERE
            return done(undefined, user);
        });
    });
}));

export let isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    return res.redirect(RouteStore.login);
};

export let isAuthorized = (req: Request, res: Response, next: NextFunction) => {
    const provider = req.path.split("/").slice(-1)[0];

    if (_.find(req.user.tokens, { kind: provider })) {
        next();
    } else {
        res.redirect(`/auth/${provider}`);
    }
};