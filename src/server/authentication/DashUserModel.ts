//@ts-ignore
import * as bcrypt from "bcrypt-nodejs";
//@ts-ignore
import * as mongoose from 'mongoose';

export type DashUserModel = mongoose.Document & {
    email: String,
    password: string,
    passwordResetToken?: string,
    passwordResetExpires?: Date,

    userDocumentId: string;
    sharingDocumentId: string;
    linkDatabaseId: string;
    cacheDocumentIds: string;

    profile: {
        name: string,
        gender: string,
        location: string,
        website: string,
        picture: string
    },

    comparePassword: comparePasswordFunction,
};

type comparePasswordFunction = (candidatePassword: string, cb: (err: any, isMatch: any) => {}) => void;

export type AuthToken = {
    accessToken: string,
    kind: string
};

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    passwordResetToken: String,
    passwordResetExpires: Date,

    userDocumentId: String,    // id that identifies a document which hosts all of a user's account data
    sharingDocumentId: String, // id that identifies a document that stores documents shared to a user, their user color, and any additional info needed to communicate between users
    linkDatabaseId: String,
    cacheDocumentIds: String, // set of document ids to retreive on startup

    facebook: String,
    twitter: String,
    google: String,

    profile: {
        name: String,
        gender: String,
        location: String,
        website: String,
        picture: String
    }
}, { timestamps: true });

/**
 * Password hash middleware.
 */
userSchema.pre("save", function save(next) {
    const user = this as DashUserModel;
    if (!user.isModified("password")) {
        return next();
    }
    bcrypt.genSalt(10, (err: any, salt: string) => {
        if (err) {
            return next(err);
        }
        bcrypt.hash(user.password, salt, () => void {}, (err: mongoose.Error, hash: string) => {
            if (err) {
                return next(err);
            }
            user.password = hash;
            next();
        });
    });
});

const comparePassword: comparePasswordFunction = function (this: DashUserModel, candidatePassword, cb) {
    // Choose one of the following bodies for authentication logic.
    // secure (expected, default)
    bcrypt.compare(candidatePassword, this.password, cb);
    // bypass password (debugging)
    // cb(undefined, true);
};

userSchema.methods.comparePassword = comparePassword;

const User = mongoose.model("User", userSchema);
export default User;