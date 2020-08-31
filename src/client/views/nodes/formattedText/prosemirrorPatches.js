'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var prosemirrorInputRules = require('prosemirror-inputrules');
var prosemirrorTransform = require('prosemirror-transform');
var prosemirrorModel = require('prosemirror-model');

exports.liftListItem = liftListItem;
exports.sinkListItem = sinkListItem;
exports.wrappingInputRule = wrappingInputRule;
exports.removeMarkWithAttrs = removeMarkWithAttrs;
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

// :: (NodeType) → (state: EditorState, dispatch: ?(tr: Transaction)) → bool
// Create a command to sink the list item around the selection down
// into an inner list.
function sinkListItem(itemType) {
    return function (state, dispatch) {
        var ref = state.selection;
        var $from = ref.$from;
        var $to = ref.$to;
        var range = $from.blockRange($to, function (node) { return node.childCount && node.firstChild.type == itemType; });
        if (!range) { return false }
        var startIndex = range.startIndex;
        if (startIndex == 0) { return false }
        var parent = range.parent, nodeBefore = parent.child(startIndex - 1);
        if (nodeBefore.type != itemType) { return false; }

        if (dispatch) {
            var nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type == parent.type;
            var inner = prosemirrorModel.Fragment.from(nestedBefore ? itemType.create() : null);
            let slice = new prosemirrorModel.Slice(prosemirrorModel.Fragment.from(itemType.create(null, prosemirrorModel.Fragment.from(parent.type.create({ ...parent.attrs, fontSize: parent.attrs.fontSize ? parent.attrs.fontSize - 4 : undefined }, inner)))),
                nestedBefore ? 3 : 1, 0);
            var before = range.start, after = range.end;
            dispatch(state.tr.step(new prosemirrorTransform.ReplaceAroundStep(before - (nestedBefore ? 3 : 1), after,
                before, after, slice, 1, true))
                .scrollIntoView());
        }
        return true
    }
}

function findWrappingOutside(range, type) {
    var parent = range.parent;
    var startIndex = range.startIndex;
    var endIndex = range.endIndex;
    var around = parent.contentMatchAt(startIndex).findWrapping(type);
    if (!around) { return null }
    var outer = around.length ? around[0] : type;
    return parent.canReplaceWith(startIndex, endIndex, outer) ? around : null
}

function findWrappingInside(range, type) {
    var parent = range.parent;
    var startIndex = range.startIndex;
    var endIndex = range.endIndex;
    var inner = parent.child(startIndex);
    var inside = type.contentMatch.findWrapping(inner.type);
    if (!inside) { return null }
    var lastType = inside.length ? inside[inside.length - 1] : type;
    var innerMatch = lastType.contentMatch;
    for (var i = startIndex; innerMatch && i < endIndex; i++) { innerMatch = innerMatch.matchType(parent.child(i).type); }
    if (!innerMatch || !innerMatch.validEnd) { return null }
    return inside
}
function findWrapping(range, nodeType, attrs, innerRange, customWithAttrs = null) {
    if (innerRange === void 0) innerRange = range;
    let withAttrs = (type) => ({ type: type, attrs: null });
    var around = findWrappingOutside(range, nodeType);
    var inner = around && findWrappingInside(innerRange, nodeType);
    if (!inner) { return null }
    return around.map(withAttrs).concat({ type: nodeType, attrs: attrs }).concat(inner.map(customWithAttrs ? customWithAttrs : withAttrs))
}
function wrappingInputRule(regexp, nodeType, getAttrs, joinPredicate, customWithAttrs = null) {
    return new prosemirrorInputRules.InputRule(regexp, function (state, match, start, end) {
        var attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
        var tr = state.tr.delete(start, end);
        var $start = tr.doc.resolve(start), range = $start.blockRange(), wrapping = range && findWrapping(range, nodeType, attrs, undefined, customWithAttrs);
        if (!wrapping) { return null }
        tr.wrap(range, wrapping);
        var before = tr.doc.resolve(start - 1).nodeBefore;
        if (before && before.type == nodeType && prosemirrorTransform.canJoin(tr.doc, start - 1) &&
            (!joinPredicate || joinPredicate(match, before))) { tr.join(start - 1); }
        return tr
    })
}


// :: ([Mark]) → ?Mark
// Tests whether there is a mark of this type in the given set.
function isInSetWithAttrs(mark, set, attrs) {
    for (var i = 0; i < set.length; i++) {
        if (set[i].type == mark) {
            if (Array.from(Object.keys(attrs)).reduce((p, akey) => {
                return p && JSON.stringify(set[i].attrs[akey]) === JSON.stringify(attrs[akey]);
            }, true)) {
                return set[i];
            }
        }
    }
};

// :: (number, number, ?union<Mark, MarkType>) → this
// Remove marks from inline nodes between `from` and `to`. When `mark`
// is a single mark, remove precisely that mark. When it is a mark type,
// remove all marks of that type. When it is null, remove all marks of
// any type.
function removeMarkWithAttrs(tr, from, to, mark, attrs) {
    if (mark === void 0) mark = null;

    var matched = [], step = 0;
    tr.doc.nodesBetween(from, to, function (node, pos) {
        if (!node.isInline) { return }
        step++;
        var toRemove = null;
        if (mark) {
            if (isInSetWithAttrs(mark, node.marks, attrs)) { toRemove = [mark]; }
        } else {
            toRemove = node.marks;
        }
        if (toRemove && toRemove.length) {
            var end = Math.min(pos + node.nodeSize, to);
            for (var i = 0; i < toRemove.length; i++) {
                var style = toRemove[i], found$1 = (void 0);
                for (var j = 0; j < matched.length; j++) {
                    var m = matched[j];
                    if (m.step == step - 1 && style.eq(matched[j].style)) { found$1 = m; }
                }
                if (found$1) {
                    found$1.to = end;
                    found$1.step = step;
                } else {
                    matched.push({ style: style, from: Math.max(pos, from), to: end, step: step });
                }
            }
        }
    });
    matched.forEach(function (m) { return tr.step(new prosemirrorTransform.RemoveMarkStep(m.from, m.to, m.style)); });
    return tr
};


