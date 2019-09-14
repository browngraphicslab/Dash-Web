import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { observable } from "mobx";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";



function hasGetUserMedia() {
    return !!(
        (navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
}

interface WebcamProps {
    audio: boolean;
    audioConstraints?: MediaStreamConstraints["audio"];
    imageSmoothing: boolean;
    minScreenshotHeight?: number;
    minScreenshotWidth?: number;
    onUserMedia: () => void;
    onUserMediaError: (error: string) => void;
    screenshotFormat: "image/webp" | "image/png" | "image/jpeg";
    screenshotQuality: number;
    videoConstraints?: MediaStreamConstraints["video"];
}

interface OuterWebcamProps {
    local: FieldViewProps;
    external: WebcamProps & React.HtmlHTMLAttributes<HTMLVideoElement>;
}

@observer
export class DashWebCam extends React.Component<OuterWebcamProps> {
    static defaultProps = {
        audio: true,
        imageSmoothing: true,
        onUserMedia: () => { },
        onUserMediaError: () => { },
        screenshotFormat: "image/webp",
        screenshotQuality: 0.92
    };

    private static mountedInstances: DashWebCam[] = [];
    private static userMediaRequested = false;
    private canvas: HTMLCanvasElement | undefined;
    private ctx: CanvasRenderingContext2D | null = null;
    private stream: MediaStream | undefined;
    private video: HTMLVideoElement | null | undefined;

    @observable private hasUserMedia: boolean | undefined;
    @observable private src: string | undefined;

    // constructor(props: any) {
    //     super(props);
    //     this.state = {
    //         hasUserMedia: false
    //     };
    // }

    componentDidMount() {
        if (!hasGetUserMedia()) return;

        // const { state } = this;

        DashWebCam.mountedInstances.push(this);

        if (!this.hasUserMedia && !DashWebCam.userMediaRequested) {
            this.requestUserMedia();
        }
    }

    componentDidUpdate(nextProps: OuterWebcamProps) {
        const { external } = this.props;
        const nextExternal = nextProps.external;
        if (
            JSON.stringify(nextExternal.audioConstraints) !==
            JSON.stringify(external.audioConstraints) ||
            JSON.stringify(nextExternal.videoConstraints) !==
            JSON.stringify(external.videoConstraints)
        ) {
            this.requestUserMedia();
        }
    }

    componentWillUnmount() {
        //const { state } = this;
        const index = DashWebCam.mountedInstances.indexOf(this);
        DashWebCam.mountedInstances.splice(index, 1);

        DashWebCam.userMediaRequested = false;
        if (DashWebCam.mountedInstances.length === 0 && this.hasUserMedia) {
            if (this.stream!.getVideoTracks && this.stream!.getAudioTracks) {
                this.stream!.getVideoTracks().map(track => track.stop());
                this.stream!.getAudioTracks().map(track => track.stop());
            } else {
                ((this.stream as unknown) as MediaStreamTrack).stop();
            }

            if (this.src) {
                window.URL.revokeObjectURL(this.src);
            }
        }
    }

    getScreenshot() {
        const { external } = this.props;

        if (!this.hasUserMedia) return null;

        const canvas = this.getCanvas();
        return (
            canvas &&
            canvas.toDataURL(external.screenshotFormat, external.screenshotQuality)
        );
    }

    getCanvas() {
        const { external } = this.props;

        if (!this.video) {
            return null;
        }

        if (!this.hasUserMedia || !this.video.videoHeight) return null;

        if (!this.ctx) {
            const canvas = document.createElement("canvas");
            const aspectRatio = this.video.videoWidth / this.video.videoHeight;

            let canvasWidth = external.minScreenshotWidth || this.video.clientWidth;
            let canvasHeight = canvasWidth / aspectRatio;

            if (
                external.minScreenshotHeight &&
                canvasHeight < external.minScreenshotHeight
            ) {
                canvasHeight = external.minScreenshotHeight;
                canvasWidth = canvasHeight * aspectRatio;
            }

            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            this.canvas = canvas;
            this.ctx = canvas.getContext("2d");
        }

        const { ctx, canvas } = this;

        if (ctx) {
            ctx.imageSmoothingEnabled = external.imageSmoothing;
            ctx.drawImage(this.video, 0, 0, canvas!.width, canvas!.height);
        }

        return canvas;
    }

    requestUserMedia() {
        const { external } = this.props;

        navigator.getUserMedia =
            navigator.mediaDevices.getUserMedia;

        const sourceSelected = (audioConstraints: any, videoConstraints: any) => {
            const constraints: MediaStreamConstraints = {
                video: typeof videoConstraints !== "undefined" ? videoConstraints : true
            };

            if (external.audio) {
                constraints.audio =
                    typeof audioConstraints !== "undefined" ? audioConstraints : true;
            }

            navigator.mediaDevices
                .getUserMedia(constraints)
                .then(stream => {
                    DashWebCam.mountedInstances.forEach(instance =>
                        instance.handleUserMedia(null, stream)
                    );
                })
                .catch(e => {
                    DashWebCam.mountedInstances.forEach(instance =>
                        instance.handleUserMedia(e)
                    );
                });
        };

        if ("mediaDevices" in navigator) {
            sourceSelected(external.audioConstraints, external.videoConstraints);
        } else {
            const optionalSource = (id: any) => ({ optional: [{ sourceId: id }] });

            const constraintToSourceId = (constraint: any) => {
                const { deviceId } = constraint;

                if (typeof deviceId === "string") {
                    return deviceId;
                }

                if (Array.isArray(deviceId) && deviceId.length > 0) {
                    return deviceId[0];
                }

                if (typeof deviceId === "object" && deviceId.ideal) {
                    return deviceId.ideal;
                }

                return null;
            };

            // @ts-ignore: deprecated api
            MediaStreamTrack.getSources(sources => {
                let audioSource = null;
                let videoSource = null;

                sources.forEach((source: { kind: string; id: any; }) => {
                    if (source.kind === "audio") {
                        audioSource = source.id;
                    } else if (source.kind === "video") {
                        videoSource = source.id;
                    }
                });

                const audioSourceId = constraintToSourceId(external.audioConstraints);
                if (audioSourceId) {
                    audioSource = audioSourceId;
                }

                const videoSourceId = constraintToSourceId(external.videoConstraints);
                if (videoSourceId) {
                    videoSource = videoSourceId;
                }

                sourceSelected(
                    optionalSource(audioSource),
                    optionalSource(videoSource)
                );
            });
        }

        DashWebCam.userMediaRequested = true;
    }

    handleUserMedia(err: string | null, stream?: MediaStream) {
        const { external } = this.props;

        if (err || !stream) {
            this.setState({ hasUserMedia: false });
            external.onUserMediaError(err!);

            return;
        }

        this.stream = stream;

        try {
            if (this.video) {
                this.video.srcObject = stream;
            }
            this.setState({ hasUserMedia: true });
        } catch (error) {
            this.setState({
                hasUserMedia: true,
                src: window.URL.createObjectURL(stream)
            });
        }

        external.onUserMedia();
    }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }




    public static LayoutString() { return FieldView.LayoutString(DashWebCam); }


    render() {
        const { props } = this;

        const { external, local } = this.props;


        const {
            audio,
            onUserMedia,
            onUserMediaError,
            screenshotFormat,
            screenshotQuality,
            minScreenshotWidth,
            minScreenshotHeight,
            audioConstraints,
            videoConstraints,
            imageSmoothing,
            ...rest
        } = external;




        let content =
            <div className="webcam-cont" style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                <video
                    autoPlay
                    src={this.src}
                    muted={audio}
                    playsInline
                    ref={ref => {
                        this.video = ref;
                    }}
                    {...rest}

                />
            </div>;


        let frozen = !local.isSelected() || DocumentDecorations.Instance.Interacting;
        let classname = "webBox-cont" + (local.isSelected() && !InkingControl.Instance.selectedTool && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");

        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
            </>);

    }
}