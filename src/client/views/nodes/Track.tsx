import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject } from "mobx";
import "./Track.scss";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps, DocumentView } from "./DocumentView";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { Doc, DocListCastAsync, DocListCast } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { emptyStatement, thisExpression, react } from "babel-types";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";
import { list } from "serializr";
import { arrays, Dictionary } from "typescript-collections";
import { forEach } from "typescript-collections/dist/lib/arrays";
import { CompileScript } from "../../util/Scripting";
import { FieldView } from "./FieldView";
import { promises } from "fs";
import { Tapable } from "tapable";
import { Keyframe, KeyframeData } from "./Keyframe";
import { timingSafeEqual } from "crypto";
import { node } from "prop-types";
type Data = List<Doc>;
type Keyframes = List<List<Doc>>;

const PositionSchema = createSchema({
    x: defaultSpec("number", 0),
    y: defaultSpec("number", 0)
});

type Position = makeInterface<[typeof PositionSchema]>;
const Position = makeInterface(PositionSchema);
const TimeAndPositionSchema = createSchema({
    time: defaultSpec("number", 0),
    position: Doc
});

type TimeAndPosition = makeInterface<[typeof TimeAndPositionSchema]>;
const TimeAndPosition = makeInterface(TimeAndPositionSchema);


interface IProp{
    node: Doc; 
    currentBarX: number; 
}

@observer
export class Track extends React.Component<IProp> {
    @observable private _inner = React.createRef<HTMLDivElement>();

    private _reactionDisposers: IReactionDisposer[] = [];
    private _selectionManagerChanged?: IReactionDisposer;

    @observable private _currentBarX: number = 0;
    @observable private _keys = ["x", "y", "width", "height", "panX", "panY", "scale"];

    // @computed private get _keyframes() {
    //     return Cast(this.props.Document.keyframes, listSpec(Doc)) as any as List<List<Doc>>;
    // }

    // @computed private get _data() {
    //     //return Cast(this.props.Document.dataa, listSpec(Doc)) as List<Doc>; 
    //     return Cast(this.props.Document[this.props.fieldKey], listSpec(Doc))!;
    // }




    @action
    timeChange = async (time: number) => {
        let leftkf: (Doc | undefined) = this.calcMinLeft(time);
        let rightkf: (Doc | undefined) = this.calcMinRight(time); 
        if (this.props.node.keyframedata!.kfs!.length < 2){
            return; 
        }
        if (leftkf && rightkf){ 
            this.interpolate(leftkf, rightkf, time); 
        } else if(leftkf){

        } else if (rightkf){

        }
    }

    
    /**
     * calculates the closest left keyframe, if there is one
     * @param kfList: keyframe list 
     * @param time 
     */
    @action
    calcMinLeft = (time: number): (Doc|undefined) => { //returns the time of the closet keyframe to the left
        let leftKf:Doc = new Doc();
        leftKf.time = Infinity; 
        this._data.forEach((kf) => {
            kf = kf as Doc;
            if (NumCast(kf.time) < time && NumCast(leftKf.time) > NumCast(kf.time)) {
                leftKf = kf;  
            }
        });
        if (NumCast(leftKf.time) === Infinity){
            return undefined; 
        }
        return leftKf;
    }

    /**
     * calculates the closest right keyframe, if there is one
     * @param kfList: keyframe lsit
     * @param time: time
     */
    @action
    calcMinRight = (time: number): (Doc|undefined) => { //returns the time of the closest keyframe to the right 
        let rightKf:Doc = new Doc();
        rightKf.time = Infinity; 
        this._data.forEach((kf) => {
            kf = kf as Doc;
            if (NumCast(kf.time) > time && NumCast(rightKf.time) > NumCast(kf.time)) {
                rightKf = kf;  
            }
        });
        if (NumCast(rightKf.time) === Infinity){
            return undefined; 
        }
        return rightKf;
    }



      /**
     * Linearly interpolates a document from time1 to time2 
     * @param Doc that needs to be modified
     * @param  kf1 timeandposition of the first yellow bar
     * @param kf2 timeandposition of the second yellow bar
     * @param time time that you want to interpolate
     */
    @action
    interpolate = async (kf1: Doc, kf2: Doc, time: number) => {
        const keyFrame1 = (await kf1)!;
        const keyFrame2 = (await kf2)!;

        const dif_time = NumCast(kf2.time) - NumCast(kf1.time);
        const ratio = (time - NumCast(kf1.time)) / dif_time; //linear 

        this._keys.forEach(key => {
            const diff = NumCast(keyFrame2[key]) - NumCast(keyFrame1[key]);
            const adjusted = diff * ratio;
            this.props.node[key] = NumCast(keyFrame1[key]) + adjusted;
        });
    }

    @action
    componentDidMount() {
        this.props.node.hidden = true; 
        this.props.node.keyframes = new List<Doc>(); 
        let keyframes = Cast(this.props.node.keyframes, listSpec(Doc)) as List<Doc>; 
        reaction (() => this.props.currentBarX, () => {
            keyframes.forEach((datum) => {
                datum = KeyframeData(datum as Doc); 
                if (keyframes.length !== 0){
                    let kf:(Doc | undefined) = this.findKeyframe(this.props.currentBarX); 
                    if (kf !== undefined){
                        this.props.node.hidden = false; 
                        console.log(toJS(kf.kfs!));
                    }
                }
            }); 
        }); 

        reaction(() => {
            let keys = Doc.allKeys(this.props.node); 
            let x = keys.indexOf("keyframes"); 
            let afterX = keys.slice(x + 1); 
            let beforeX = keys.slice(0, x); 
            keys = beforeX.concat(afterX); 
            return keys.map(key => FieldValue(this.props.node[key]));
        }, data => {
            if (keyframes.length !== 0){
                let kf:(Doc | undefined) = this.findKeyframe(this.props.currentBarX); 
                console.log(kf + "from reaction wheh moving"); 
            }
        }); 
    }


    @action 
    findKeyframe(time:number): (Doc | undefined){
        let foundKeyframe = undefined; 
        (Cast(this.props.node.keyframes, listSpec(Doc)) as List<Doc>).map(kf => {
            kf = kf as Doc; 
            if (time >= NumCast(kf.position) && time <= (NumCast(kf.position) + NumCast(kf.duration))){
                foundKeyframe = kf; 
            }    
        }); 
        return foundKeyframe; 
    }
    /**
     * removes reaction when the component is removed from the timeline
     */
    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
    }

    @observable private _keyframes: JSX.Element[] = []; 
    
    @computed
    get keyframes() {
       return Cast(this.props.node.keyframes, listSpec(Doc)) as List<Doc>;
    }

    @action 
    onInnerDoubleClick = (e: React.MouseEvent) => {
        let inner = this._inner.current!; 
        let left = inner.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left);
        let keyframedata:Doc = new Doc(); 
        keyframedata.duration = 200; 
        keyframedata.position = offsetX; 
        keyframedata.kfs = new List<Doc>(); 
        this.keyframes.push(keyframedata); 
        this._keyframes.push(<Keyframe node={this.props.node} keyframedata={keyframedata}/>); 
    }

    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick}>
                        {this._keyframes.map((element)=> element)}
                    </div>
                </div>
            </div>
        );
    }
}