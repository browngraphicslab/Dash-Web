//@ts-ignore
import * as bcrypt from "bcrypt-nodejs";
//@ts-ignore
import * as mongoose from "mongoose";
var url = 'mongodb://localhost:27017/Dash'

mongoose.connect(url, { useNewUrlParser: true });

mongoose.connection.on('connected', function () {
    console.log('Stablished connection on ' + url);
});
mongoose.connection.on('error', function (error) {
    console.log('Something wrong happened: ' + error);
});
mongoose.connection.on('disconnected', function () {
    console.log('connection closed');
});
export type DashUserModel = mongoose.Document & {
    email: string,
    password: string,
    passwordResetToken: string | undefined,
    passwordResetExpires: Date | undefined,

    allWorkspaceIds: Array<String>,
    activeWorkspaceId: String,
    activeUsersId: String,

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
    email: { type: String, unique: true },
    password: String,
    passwordResetToken: String,
    passwordResetExpires: Date,

    allWorkspaceIds: {
        type: Array,
        default: []
    },
    activeWorkspaceId: String,
    activeUsersId: String,

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
    if (!user.isModified("password")) { return next(); }
    bcrypt.genSalt(10, (err, salt) => {
        if (err) { return next(err); }
        bcrypt.hash(user.password, salt, () => void {}, (err: mongoose.Error, hash) => {
            if (err) { return next(err); }
            user.password = hash;
            next();
        });
    });
});

const comparePassword: comparePasswordFunction = function (this: DashUserModel, candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, (err: mongoose.Error, isMatch: boolean) => {
        cb(err, isMatch);
    });
};

userSchema.methods.comparePassword = comparePassword;

const User = mongoose.model("User", userSchema);
export default User;