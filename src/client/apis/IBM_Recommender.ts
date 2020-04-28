// import { Opt } from "../../new_fields/Doc";

// const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
// const { IamAuthenticator } = require('ibm-watson/auth');

// export namespace IBM_Recommender {

//     // pass to IBM account is Browngfx1

//     const naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
//         version: '2019-07-12',
//         authenticator: new IamAuthenticator({
//             apikey: 'tLiYwbRim3CnBcCO4phubpf-zEiGcub1uh0V-sD9OKhw',
//         }),
//         url: 'https://gateway-wdc.watsonplatform.net/natural-language-understanding/api'
//     });

//     const analyzeParams = {
//         'text': 'this is a test of the keyword extraction feature I am integrating into the program',
//         'features': {
//             'keywords': {
//                 'sentiment': true,
//                 'emotion': true,
//                 'limit': 3
//             },
//         }
//     };

//     export const analyze = async (_parameters: any): Promise<Opt<string>> => {
//         try {
//             const response = await naturalLanguageUnderstanding.analyze(_parameters);
//             console.log(response);
//             return (JSON.stringify(response, null, 2));
//         } catch (err) {
//             console.log('error: ', err);
//             return undefined;
//         }
//     };

// }