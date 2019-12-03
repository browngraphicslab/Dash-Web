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

    userDocumentId: String,

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
    bcrypt.genSalt(10, (err, salt) => {
        if (err) {
            return next(err);
        }
        bcrypt.hash(user.password, salt, () => void {}, (err: mongoose.Error, hash) => {
            if (err) {
                return next(err);
            }
            user.password = hash;
            next();
        });
    });
});

const comparePassword: comparePasswordFunction = function (this: DashUserModel, candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, cb);
};

userSchema.methods.comparePassword = comparePassword;

const User = mongoose.model("User", userSchema);
export default User;