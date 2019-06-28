import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject } from "mobx";
import "./Track.scss";
import { Doc, DocListCastAsync, DocListCast } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Keyframe, RegionData } from "./Keyframe";

interface IProp {
    node: Doc;
    currentBarX: number;
    // setPosition: (position: number) => any;
}

@observer
export class Track extends React.Component<IProp> {
    @observable private _inner = React.createRef<HTMLDivElement>();

    private _reactionDisposers: IReactionDisposer[] = [];
    private _selectionManagerChanged?: IReactionDisposer;

    @observable private _keys = ["x", "y", "width", "height", "panX", "panY", "scale"];


    componentWillMount() {
        this.props.node.regions = new List<Doc>();
        console.log((Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>).length);
    }

    @action
    componentDidMount() {
        this.props.node.hidden = true;
        this.props.node.opacity = 0;
        reaction(() => this.props.currentBarX, () => {
            let region: (Doc | undefined) = this.findRegion(this.props.currentBarX);
            if (region !== undefined) {
                this.props.node.hidden = false;
                this.timeChange(this.props.currentBarX);
            } else {
                this.props.node.hidden = true;
            }
        });

        // reaction(() => {
        //     let keys = Doc.allKeys(this.props.node); 
        //     let x = keys.indexOf("keyframes"); 
        //     let afterX = keys.slice(x + 1); 
        //     let beforeX = keys.slice(0, x); 
        //     keys = beforeX.concat(afterX); 
        //     return keys.map(key => FieldValue(this.props.node[key]));
        // }, data => {
        //     if (this.keyframes.length !== 0){
        //         let kf:(Doc | undefined) = this.findKeyframe(this.props.currentBarX); 
        //     }
        // }); 
    }
    /**
     * removes reaction when the component is removed from the timeline
     */
    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
    }


    @action
    timeChange = async (time: number) => {
        let region = this.findRegion(time);
        let leftkf: (Doc | undefined) = this.calcMinLeft(region!);
        let rightkf: (Doc | undefined) = this.calcMinRight(region!);

        if (leftkf && rightkf) {
            this.interpolate(leftkf, rightkf);
        } else if (leftkf) {
            console.log("left exists");
            this._keys.forEach(k => {
                let data = leftkf!.key as Doc;
                this.props.node[k] = data[k];
            });
        } else if (rightkf) {
            console.log("right exists");
            this._keys.forEach(k => {
                let data = rightkf!.key as Doc;
                this.props.node[k] = data[k];
            });
        }
    }


    /**
     * calculates the closest left keyframe, if there is one
     * @param kfList: keyframe list 
     * @param time 
     */
    @action
    calcMinLeft = (region: Doc): (Doc | undefined) => { //returns the time of the closet keyframe to the left
        let leftKf: Doc = new Doc();
        leftKf.time = Infinity;
        (region.keyframes! as List<Doc>).forEach((kf) => {
            kf = kf as Doc;
            if (NumCast(kf.time) < this.props.currentBarX && NumCast(leftKf.time) > NumCast(kf.time)) {
                leftKf = kf;
            }
        });
        if (NumCast(leftKf.time) === Infinity) {
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
    calcMinRight = (region: Doc): (Doc | undefined) => { //returns the time of the closest keyframe to the right 
        let rightKf: Doc = new Doc();
        rightKf.time = Infinity;
        (region.keyframes! as List<Doc>).forEach((kf) => {
            kf = kf as Doc;
            if (NumCast(kf.time) > this.props.currentBarX && NumCast(rightKf.time) > NumCast(kf.time)) {
                rightKf = kf;
            }
        });
        if (NumCast(rightKf.time) === Infinity) {
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
    interpolate = async (kf1: Doc, kf2: Doc) => {
        let node1 = kf1.key as Doc;
        let node2 = kf2.key as Doc;
        console.log(toJS(node1));
        console.log(toJS(node2));
        const dif_time = NumCast(kf2.time) - NumCast(kf1.time);
        const ratio = (this.props.currentBarX - NumCast(kf1.time)) / dif_time; //linear 

        this._keys.forEach(key => {
            const diff = NumCast(node2[key]) - NumCast(node1[key]);
            const adjusted = diff * ratio;
            this.props.node[key] = NumCast(node1[key]) + adjusted;
        });
    }



    @action
    findRegion(time: number): (Doc | undefined) {
        let foundRegion = undefined;
        this.regions.map(region => {
            region = RegionData(region as Doc);
            if (time >= NumCast(region.position) && time <= (NumCast(region.position) + NumCast(region.duration))) {
                foundRegion = region;
            }
        });
        return foundRegion;
    }


    @action
    onInnerDoubleClick = (e: React.MouseEvent) => {
        let inner = this._inner.current!;
        let left = inner.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left);
        let regiondata: Doc = new Doc(); //creating regiond ata
        regiondata.duration = 200;
        regiondata.position = offsetX;
        regiondata.keyframes = new List<Doc>();
        this.regions.push(regiondata);
    }


    @computed
    private get regions() {
        console.log((Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>).length + "from get");
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }

    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick}>
                        {this.regions.map((region) => {
                            return <Keyframe node={this.props.node} RegionData={region as Doc}/>;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}