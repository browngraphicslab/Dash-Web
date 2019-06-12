import React = require("react");
import { action, computed, IReactionDisposer, reaction, observable } from "mobx";
import { observer} from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionTimelineView.scss";
import { CollectionSubView } from "./CollectionSubView";

@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {

    buttonloop(){
      let buttons = [];
      let arr = [];
      //Building the array is kinda weird because I reverse engineered something from another class.
      this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
          arr.push(StrCast(d.title))
      });
      arr= this.selectionSort(arr);
      var len = arr.length;

      for (let i=0;i<arr.length;i++){
        buttons.push(
            <button
style={{position:"absolute",
          top: "50%", left:(i*100/len)+ "%", width:(5/(2*Math.log2((len/10)+1)))+ "%"}}>{arr[i]}</button>)
      }
      return buttons;
    }


selectionSort(arr){
  var minIdx, temp,
      len = arr.length;
  for(var i = 0; i < len; i++){
    minIdx = i;
    for(var  j = i+1; j<len; j++){
       if(arr[j]<arr[minIdx]){
          minIdx = j;
       }
    }
    temp = arr[i];
    arr[i] = arr[minIdx];
    arr[minIdx] = temp;
  }
  return arr;
}


    render() {
        let thing=this.singleColumnChildren;
        return (
          <div className="collectionTimelineView" style={{ height: "100%" }}
           onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
              <hr style={{top:"50%", display:"block", width:"100%", border:"10", position:"absolute"}}/>

                {this.buttonloop()}

          </div>
        );
    }
}
