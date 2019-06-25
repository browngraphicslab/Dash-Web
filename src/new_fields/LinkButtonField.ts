// import { Deserializable } from "../client/util/SerializationHelper";
// import { serializable, primitive, createSimpleSchema, object } from "serializr";
// import { ObjectField } from "./ObjectField";
// import { Copy, ToScriptString } from "./FieldSymbols";
// import { Doc } from "./Doc";
// import { DocumentView } from "../client/views/nodes/DocumentView";

// export type LinkButtonData = {
//     sourceViewId: string,
//     targetViewId: string
// };

// const LinkButtonSchema = createSimpleSchema({
//     sourceViewId: true,
//     targetViewId: true
// });

// @Deserializable("linkButton")
// export class LinkButtonField extends ObjectField {
//     @serializable(object(LinkButtonSchema))
//     readonly data: LinkButtonData;

//     constructor(data: LinkButtonData) {
//         super();
//         this.data = data;
//     }

//     [Copy]() {
//         return new LinkButtonField(this.data);
//     }

//     [ToScriptString]() {
//         return "invalid";
//     }
// }
