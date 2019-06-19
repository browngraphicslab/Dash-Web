import * as React from "react"; 
import * as ReactDOM from "react-dom"; 
import "./Timeline.scss"; 
import { CollectionSubView } from "../collections/CollectionSubView";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { observer } from "mobx-react";
import { Track } from "./Track";


@observer
export class Timeline extends CollectionSubView(Document){

    render(){
        return (
            <div className="timeline-container">
                <div className="toolbox">
                    <button> Play </button>
                </div>
                <div className="trackbox">
                    <Track {...this.props}/>
                </div> 
            </div>
        ); 
    }

}