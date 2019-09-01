// import request = require('request-promise');
// const key = require("../../credentials/auth.json");

// export const PhotosLibraryQuery = async (authToken: any, parameters: any) => {
//     let options = {
//         headers: { 'Content-Type': 'application/json' },
//         json: parameters,
//         auth: { 'bearer': authToken },
//     };
//     const result = await request.post(config.apiEndpoint + '/v1/mediaItems:search', options);
//     return result;
// };