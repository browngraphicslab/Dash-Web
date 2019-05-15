import React = require("react");
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import * as rp from "request-promise";
import "./VideoBox.scss";
import { action, computed, trace } from "mobx";
import { DocComponent } from "../DocComponent";
import { positionSchema } from "./DocumentView";
import { makeInterface } from "../../../new_fields/Schema";
import { pageSchema } from "./ImageBox";
import { Cast, FieldValue, NumCast, ToConstructor, ListSpec } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import Measure from "react-measure";
import "./VideoBox.scss";
import { Field, FieldResult, Opt } from "../../../new_fields/Doc";
import { RouteStore } from "../../../server/RouteStore";
import { DocServer } from "../../DocServer";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {

    private _videoRef: HTMLVideoElement | null = null;
    private _loaded: boolean = false;
    private get initialTimecode() { return FieldValue(this.Document.curPage, -1); }
    public static LayoutString() { return FieldView.LayoutString(VideoBox); }

    public get player(): HTMLVideoElement | undefined {
        if (this._videoRef) {
            return this._videoRef;
        }
    }
    @action
    setScaling = (r: any) => {
        if (this._loaded) {
            // bcz: the nativeHeight should really be set when the document is imported.
            var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
            var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
            var newNativeHeight = nativeWidth * r.offset.height / r.offset.width;
            if (!nativeHeight && newNativeHeight !== nativeHeight && !isNaN(newNativeHeight)) {
                this.Document.height = newNativeHeight / nativeWidth * FieldValue(this.Document.width, 0);
                this.Document.nativeHeight = newNativeHeight;
            }
        } else {
            this._loaded = true;
        }
    }

    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
        if (this.initialTimecode >= 0 && vref) {
            vref.currentTime = this.initialTimecode;
        }
    }
    videoContent(path: string) {
        return <video className="videobox-cont" ref={this.setVideoRef}>
            <source src={path} type="video/mp4" />
            Not supported.
        </video>;
    }

    getMp4ForVideo(videoId: string = "JN5beCVArMs") {
        return new Promise(async (resolve, reject) => {
            const videoInfoRequestConfig = {
                headers: {
                    connection: 'keep-alive',
                    "user-agent": 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:43.0) Gecko/20100101 Firefox/46.0',
                },

            }
            try {
                let responseSchema: any = {};
                const videoInfoResponse = await rp.get(DocServer.prepend(RouteStore.corsProxy + "/" + `https://www.youtube.com/watch?v=${videoId}`), videoInfoRequestConfig)
                const dataHtml = videoInfoResponse;
                const start = dataHtml.indexOf('ytplayer.config = ') + 18;
                const end = dataHtml.indexOf(';ytplayer.load');
                const subString = dataHtml.substring(start, end)
                const subJson = JSON.parse(subString);
                const stringSub = subJson.args.player_response;
                const stringSubJson = JSON.parse(stringSub);
                const adaptiveFormats = stringSubJson.streamingData.adaptiveFormats;
                const videoDetails = stringSubJson.videoDetails
                responseSchema["adaptiveFormats"] = adaptiveFormats;
                responseSchema["videoDetails"] = videoDetails;
                resolve(responseSchema)
            }
            catch (err) {
                console.log(`
                --- Youtube ---
                Function: getMp4ForVideo
                Error: `, err)
                reject(err)
            }
        })
    }


    render() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        if (!field) {
            return <div>Loading</div>;
        }

        // this.getMp4ForVideo().then((mp4) => {
        //     console.log(mp4);
        // }).catch(e => {
        //     console.log("")
        // });
        // //
        let content = this.videoContent(field.url.href);
        return NumCast(this.props.Document.nativeHeight) ?
            content :
            <Measure offset onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div style={{ width: "100%", height: "auto" }} ref={measureRef}>
                        {content}
                    </div>
                }
            </Measure>;
    }
}