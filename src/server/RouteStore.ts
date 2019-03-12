// PREPEND ALL ROUTES WITH FORWARD SLASHES!

export enum RouteStore {
    // GENERAL
    root = "/root",
    home = "/home",
    corsProxy = "/corsProxy",
    delete = "/delete",

    // UPLOAD AND STATIC FILE SERVING
    public = "/public",
    upload = "/upload",
    images = "/images",

    // USER AND WORKSPACES
    addWorkspace = "/addWorkspaceId",
    getAllWorkspaces = "/getAllWorkspaceIds",
    getActiveWorkspace = "/getActiveWorkspaceId",
    setActiveWorkspace = "/setActiveWorkspaceId",

    // AUTHENTICATION
    signup = "/signup",
    login = "/login",
    logout = "/logout",
    forgot = "/forgotpassword",
    reset = "/reset/:token",

}