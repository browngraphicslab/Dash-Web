'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var prosemirrorTransform = require('prosemirror-transform');
var prosemirrorModel = require('prosemirror-model');

exports.liftListItem = liftListItem;
// :: (NodeType) → (state: EditorState, dispatch: ?(tr: Transaction)) → bool
// Create a command to lift the list item around the selection up into
// a wrapping list.
function liftListItem(itemType) {
    return function (tx, dispatch) {
        var ref = tx.selection;
        var $from = ref.$from;
        var $to = ref.$to;
        var range = $from.blockRange($to, function (node) { return node.childCount && node.firstChild.type == itemType; });
        if (!range) { return false }
        if (!dispatch) { return true }
        if ($from.node(range.depth - 1).type == itemType) // Inside a parent list
        { return liftToOuterList(tx, dispatch, itemType, range) }
        else // Outer list node
        { return liftOutOfList(tx, dispatch, range) }
    }
}

function liftToOuterList(tr, dispatch, itemType, range) {
    var end = range.end, endOfList = range.$to.end(range.depth);
    if (end < endOfList) {
        // There are siblings after the lifted items, which must become
        // children of the last item
        tr.step(new prosemirrorTransform.ReplaceAroundStep(end - 1, endOfList, end, endOfList,
            new prosemirrorModel.Slice(prosemirrorModel.Fragment.from(itemType.create(null, range.parent.copy())), 1, 0), 1, true));
        range = new prosemirrorModel.NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth);
    }
    dispatch(tr.lift(range, prosemirrorTransform.liftTarget(range)).scrollIntoView());
    return true
}

function liftOutOfList(tr, dispatch, range) {
    var list = range.parent;
    // Merge the list items into a single big item
    for (var pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
        pos -= list.child(i).nodeSize;
        tr.delete(pos - 1, pos + 1);
    }
    var $start = tr.doc.resolve(range.start), item = $start.nodeAfter;
    var atStart = range.startIndex == 0, atEnd = range.endIndex == list.childCount;
    var parent = $start.node(-1), indexBefore = $start.index(-1);
    if (!parent.canReplace(indexBefore + (atStart ? 0 : 1), indexBefore + 1,
        item.content.append(atEnd ? prosemirrorModel.Fragment.empty : prosemirrorModel.Fragment.from(list)))) { return false }
    var start = $start.pos, end = start + item.nodeSize;
    // Strip off the surrounding list. At the sides where we're not at
    // the end of the list, the existing list is closed. At sides where
    // this is the end, it is overwritten to its end.
    tr.step(new prosemirrorTransform.ReplaceAroundStep(start - (atStart ? 1 : 0), end + (atEnd ? 1 : 0), start + 1, end - 1,
        new prosemirrorModel.Slice((atStart ? prosemirrorModel.Fragment.empty : prosemirrorModel.Fragment.from(list.copy(prosemirrorModel.Fragment.empty)))
            .append(atEnd ? prosemirrorModel.Fragment.empty : prosemirrorModel.Fragment.from(list.copy(prosemirrorModel.Fragment.empty))),
            atStart ? 0 : 1, atEnd ? 0 : 1), atStart ? 0 : 1));
    dispatch(tr.scrollIntoView());
    return true
}