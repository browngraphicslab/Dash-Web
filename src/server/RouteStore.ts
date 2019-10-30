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
    dataUriToImage = "/uploadURI",
    images = "/images",
    inspectImage = "/inspectImage",
    imageHierarchyExport = "/imageHierarchyExport",

    // USER AND WORKSPACES
    getCurrUser = "/getCurrentUser",
    getUsers = "/getUsers",
    getUserDocumentId = "/getUserDocumentId",
    updateCursor = "/updateCursor",

    openDocumentWithId = "/doc/:docId",

    // AUTHENTICATION
    signup = "/signup",
    login = "/login",
    logout = "/logout",
    forgot = "/forgotpassword",
    reset = "/reset/:token",

    // APIS
    cognitiveServices = "/cognitiveservices",
    googleDocs = "/googleDocs",
    readGoogleAccessToken = "/readGoogleAccessToken",
    writeGoogleAccessToken = "/writeGoogleAccessToken",
    googlePhotosMediaUpload = "/googlePhotosMediaUpload",
    googlePhotosMediaDownload = "/googlePhotosMediaDownload",
    googleDocsGet = "/googleDocsGet",
    checkGoogle = "/checkGoogleAuthentication"

}