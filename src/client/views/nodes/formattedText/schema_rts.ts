import { Schema, Slice } from "prosemirror-model";

import { nodes } from "./nodes_rts";
import { marks } from "./marks_rts";


// :: Schema
// This schema rougly corresponds to the document schema used by
// [CommonMark](http://commonmark.org/), minus the list elements,
// which are defined in the [`prosemirror-schema-list`](#schema-list)
// module.
//
// To reuse elements from this schema, extend or read from its
// `spec.nodes` and `spec.marks` [properties](#model.Schema.spec).

export const schema = new Schema({ nodes, marks });

const fromJson = schema.nodeFromJSON;

schema.nodeFromJSON = (json: any) => {
    const node = fromJson(json);
    if (json.type === schema.nodes.summary.name) {
        node.attrs.text = Slice.fromJSON(schema, node.attrs.textslice);
    }
    return node;
};