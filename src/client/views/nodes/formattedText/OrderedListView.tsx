export class OrderedListView {

    update(node: any) {
        // if attr's of an ordered_list (e.g., bulletStyle) change, 
        // return false forces the dom node to be recreated which is necessary for the bullet labels to update
        return false; 
    }
}