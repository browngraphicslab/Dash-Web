import React = require("react");
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, FieldValue } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { RouteStore } from "../../../server/RouteStore";
import { DocServer } from "../../DocServer";
import { DocComponent } from "../DocComponent";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./VideoBox.scss";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { InkingControl } from "../InkingControl";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    private _reactionDisposer?: IReactionDisposer;
    private _videoRef: HTMLVideoElement | null = null;
    @observable _playTimer?: NodeJS.Timeout = undefined;
    @observable _fullScreen = false;
    @observable public Playing: boolean = false;
    public static LayoutString() { return FieldView.LayoutString(VideoBox); }

    public get player(): HTMLVideoElement | null {
        return this._videoRef;
    }

    videoLoad = () => {
        let aspect = this.player!.videoWidth / this.player!.videoHeight;
        var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
        var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
        if (!nativeWidth || !nativeHeight) {
            if (!this.Document.nativeWidth) this.Document.nativeWidth = this.player!.videoWidth;
            this.Document.nativeHeight = this.Document.nativeWidth / aspect;
            this.Document.height = FieldValue(this.Document.width, 0) / aspect;
        }
    }

    @action public Play() {
        this.Playing = true;
        if (this.player) this.player.play();
        if (!this._playTimer) this._playTimer = setInterval(this.updateTimecode, 500);
    }

    @action public Pause() {
        this.Playing = false;
        if (this.player) this.player.pause();
        if (this._playTimer) {
            clearInterval(this._playTimer);
            this._playTimer = undefined;
        }
    }

    @action public FullScreen() {
        this._fullScreen = true;
        this.player && this.player.requestFullscreen();
    }

    @action
    updateTimecode = () => {
        this.player && (this.props.Document.curPage = this.player.currentTime);
    }

    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);
    }
    componentWillUnmount() {
        this.Pause();
        if (this._reactionDisposer) this._reactionDisposer();
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
        if (vref) {
            vref.onfullscreenchange = action((e) => this._fullScreen = vref.webkitDisplayingFullscreen);
            if (this._reactionDisposer) this._reactionDisposer();
            this._reactionDisposer = reaction(() => this.props.Document.curPage, () =>
                !this.Playing && (vref.currentTime = this.Document.curPage || 0)
                , { fireImmediately: true });
        }
    }

    getMp4ForVideo(videoId: string = "JN5beCVArMs") {
        return new Promise(async (resolve, reject) => {
            const videoInfoRequestConfig = {
                headers: {
                    connection: 'keep-alive',
                    "user-agent": 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:43.0) Gecko/20100101 Firefox/46.0',
                },
            };
            try {
                let responseSchema: any = {};
                const videoInfoResponse = await rp.get(DocServer.prepend(RouteStore.corsProxy + "/" + `https://www.youtube.com/watch?v=${videoId}`), videoInfoRequestConfig);
                const dataHtml = videoInfoResponse;
                const start = dataHtml.indexOf('ytplayer.config = ') + 18;
                const end = dataHtml.indexOf(';ytplayer.load');
                const subString = dataHtml.substring(start, end);
                const subJson = JSON.parse(subString);
                const stringSub = subJson.args.player_response;
                const stringSubJson = JSON.parse(stringSub);
                const adaptiveFormats = stringSubJson.streamingData.adaptiveFormats;
                const videoDetails = stringSubJson.videoDetails;
                responseSchema.adaptiveFormats = adaptiveFormats;
                responseSchema.videoDetails = videoDetails;
                resolve(responseSchema);
            }
            catch (err) {
                console.log(`
                --- Youtube ---
                Function: getMp4ForVideo
                Error: `, err);
                reject(err);
            }
        });
    }
    onPointerDown = (e: React.PointerEvent) => {
    }

    @observable static _showControls: boolean = false;

    specificContextMenu = (e: React.MouseEvent): void => {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        if (field) {
            let subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Toggle Show Controls", event: action(() => VideoBox._showControls = !VideoBox._showControls), icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Video Funcs...", subitems: subitems });
        }
    }

    render() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);

        // this.getMp4ForVideo().then((mp4) => {
        //     console.log(mp4);
        // }).catch(e => {
        //     console.log("")
        // });
        // //

        let interactive = InkingControl.Instance.selectedTool ? "" : "-interactive";
        let style = "videoBox-cont" + (this._fullScreen ? "-fullScreen" : interactive);
        return !field ? <div>Loading</div> :
            <video className={`${style}`} ref={this.setVideoRef} onCanPlay={this.videoLoad} onPointerDown={this.onPointerDown} onContextMenu={this.specificContextMenu} controls={VideoBox._showControls}>
                <source src={field.url.href} type="video/mp4" />
                Not supported.
            </video>;
    }
}