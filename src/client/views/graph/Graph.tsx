import * as React from "react";
import {observable} from "mobx"; 
import { observer } from "mobx-react";
import { Document, listSpec } from "../../../new_fields/Schema";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionSubView, CollectionViewProps, SubCollectionViewProps } from "../collections/CollectionSubView";




export class Graph extends CollectionSubView(Document) {
    static Instance:Graph; 

    private constructor(props:SubCollectionViewProps) {
        super(props); 
        Graph.Instance = this; 
    }




    render() {
        return (
            <CollectionFreeFormView {...this.props}/>
            
        ); 
    }

}