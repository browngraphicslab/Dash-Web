// PREPEND ALL ROUTES WITH FORWARD SLASHES!

export enum RouteStore {
    // GENERAL
    root = "/",
    home = "/home",
    corsProxy = "/corsProxy",
    delete = "/delete",
    deleteAll = "/deleteAll",
    pull = "/pull",

    // UPLOAD AND STATIC FILE SERVING
    public = "/public",
    upload = "/upload",
    images = "/images",

    // USER AND WORKSPACES
    getCurrUser = "/getCurrentUser",
    getUserDocumentId = "/getUserDocumentId",
    updateCursor = "/updateCursor",

    openDocumentWithId = "/doc/:docId",

    // AUTHENTICATION
    signup = "/signup",
    login = "/login",
    logout = "/logout",
    forgot = "/forgotpassword",
    reset = "/reset/:token",

}