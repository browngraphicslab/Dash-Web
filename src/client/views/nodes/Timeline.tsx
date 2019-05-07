import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray } from "mobx";
import "./Timeline.scss";
import { KeyFrame } from "./KeyFrame";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps, DocumentView } from "./DocumentView";

import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { Doc, Self } from "../../../new_fields/Doc";
import { Document, listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast } from "../../../new_fields/Types";
import { emptyStatement } from "babel-types";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";


@observer
export class Timeline extends CollectionSubView(Document) {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _timeInput = React.createRef<HTMLInputElement>();

    @observable private _isRecording: Boolean = false;
    @observable private _currentBar: any = null;
    @observable private _newBar: any = null;
    private _reactionDisposers: IReactionDisposer[] = [];
    private _keyFrames: KeyFrame[] = [];
    private _keyBars: HTMLDivElement[] = [];

    private _currentBarX: number = 0;
    @observable private _onBar: Boolean = false;


    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        if (!children) {
            return;
        }
        let childrenList = (children[Self] as any).__fields;
        let keys = ["x", "y"];

        const addReaction = (element: Doc) => {
            element = (element as any).value();
            return reaction(() => {
                return keys.map(key => FieldValue(element[key]));
            }, data => {
                if (this._inner.current) {
                    let keyFrame: KeyFrame; //keyframe reference
                    let exists:boolean = false; 
                    let time:number = this._currentBarX; //time that indicates what frame you are in. Whole numbers. 
                    let frames:List<Doc>; 
                    this._keyFrames.forEach(kf => { //checks if there is a keyframe that is tracking htis document. 
                        if (kf.doc.document === element) {
                            keyFrame = kf; 
                            frames = Cast(keyFrame.doc.frames, listSpec(Doc))!;  
                            exists = true; 
                        }
                    }); 

                    if (!exists){
                        keyFrame = new KeyFrame(); 
                        let bar:HTMLDivElement = this.createBar(5, time, "yellow"); 
                        this._inner.current.appendChild(bar); 
                        keyFrame.doc.bar = bar; 
                        keyFrame.doc.frames = new List<Doc>();
                        
                        this._keyFrames.push(keyFrame); 
                    }
                    
                    keys.forEach((key, index) => {
                        console.log(data[index]); 
                        if (keyFrame.doc.frames !== undefined){
                            frames.forEach(frame => {
                                if (frame.time === this._currentBarX){
                                    frame.key = data[index]; 
                                }
                            }); 
                        }
                        
                        //keyFrame.document[key] = data[index];
                    });
                }
            });
        };
        
      
        observe(childrenList as IObservableArray<Doc>, change => {
            
            if (change.type === "update") { 
                this._reactionDisposers[change.index]();
                this._reactionDisposers[change.index] = addReaction(change.newValue);
            } else {
                let removed = this._reactionDisposers.splice(change.index, change.removedCount, ...change.added.map(addReaction));
                removed.forEach(disp => disp());
            }
        }, true); 
        
    }

    @action 
    displayKeyFrames = (dv: DocumentView) => {
        console.log(dv); 
        dv.props.Document; 
        
    }


    @action
    onInnerPointerUp = (e: React.PointerEvent) => {
        if (this._inner.current) {
            this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove);
        }
    }

    @action
    onInnerPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._isRecording) {
            if (this._inner.current) {
                let mouse = e.nativeEvent;
                let offsetX = Math.round(mouse.offsetX);
                this._currentBarX = offsetX;
                this._currentBar.style.transform = `translate(${offsetX}px)`;
                this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove); //reset
                this._inner.current.addEventListener("pointermove", this.onInnerPointerMove);
            }
        }
    }

    @action
    onInnerPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let offsetX = Math.round(e.offsetX);
        this._currentBarX = offsetX;
        this._currentBar.style.transform = `translate(${offsetX}px)`;
        console.log(offsetX);
        console.log(this._currentBarX);
    }

    createBar = (width: number, pos:number = 0, color:string = "green"): HTMLDivElement => {
        let bar = document.createElement("div");
        bar.style.height = "100%";
        bar.style.width = `${width}px`;
        bar.style.backgroundColor = color;
        bar.style.transform = `translate(${pos}px)`;
        bar.style.position = "absolute";
        bar.style.pointerEvents = "none";
        return bar;
    }

    onTimeEntered = (e:React.KeyboardEvent) => {
        if (this._timeInput.current){
            if (e.keyCode === 13){     
                let input = parseInt(this._timeInput.current.value) || 0; 
                this._currentBar.style.transform = `translate(${input}px)`;
                this._currentBarX = input; 
            }
        }
    }
    
    componentDidMount() {
        if (this._inner.current && this._currentBar === null) {
            this._currentBar = this.createBar(5);
            this._inner.current.appendChild(this._currentBar);
        }

        let doc: Doc = this.props.Document;
        let test = this.props.Document[this.props.fieldKey];

    }

    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
    }

    render() {
        return (
            <div>
                <div className="timeline-container">
                    <div className="timeline">
                        <div className="inner" ref={this._inner} onPointerDown={this.onInnerPointerDown} onPointerUp={this.onInnerPointerUp}>
                        {
                            SelectionManager.SelectedDocuments().map((dv) => {
                                this.displayKeyFrames(dv); 
                            })
                        }
                        </div>
                    </div>
                    <button onClick={this.onRecord}>Record</button>
                    <input placeholder="Time" ref={this._timeInput} onKeyDown={this.onTimeEntered}></input>
                </div>
            </div>
        );
    }
}