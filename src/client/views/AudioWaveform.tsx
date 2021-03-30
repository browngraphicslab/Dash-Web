import React = require("react");
import axios from "axios";
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import Waveform from "react-audio-waveform";
import { Doc } from "../../fields/Doc";
import { List } from "../../fields/List";
import { listSpec } from "../../fields/Schema";
import { Cast } from "../../fields/Types";
import { numberRange } from "../../Utils";
import "./AudioWaveform.scss";

export interface AudioWaveformProps {
    duration: number;
    mediaPath: string;
    dataDoc: Doc;
    PanelHeight: () => number;
}

@observer
export class AudioWaveform extends React.Component<AudioWaveformProps> {
    public static NUMBER_OF_BUCKETS = 100;
    @computed get _waveHeight() { return Math.max(50, this.props.PanelHeight()); }
    componentDidMount() {
        const audioBuckets = Cast(this.props.dataDoc.audioBuckets, listSpec("number"), []);
        if (!audioBuckets.length) {
            this.props.dataDoc.audioBuckets = new List<number>([0, 0]); /// "lock" to prevent other views from computing the same data
            setTimeout(this.createWaveformBuckets);
        }
    }
    // decodes the audio file into peaks for generating the waveform
    createWaveformBuckets = async () => {
        axios({ url: this.props.mediaPath, responseType: "arraybuffer" })
            .then(response => {
                const context = new window.AudioContext();
                context.decodeAudioData(response.data,
                    action(buffer => {
                        const decodedAudioData = buffer.getChannelData(0);
                        const bucketDataSize = Math.floor(decodedAudioData.length / AudioWaveform.NUMBER_OF_BUCKETS);
                        const brange = Array.from(Array(bucketDataSize));
                        this.props.dataDoc.audioBuckets = new List<number>(
                            numberRange(AudioWaveform.NUMBER_OF_BUCKETS).map((i: number) =>
                                brange.reduce((p, x, j) => Math.abs(Math.max(p, decodedAudioData[i * bucketDataSize + j])), 0) / 2));
                    }));
            });
    }

    render() {
        const audioBuckets = Cast(this.props.dataDoc.audioBuckets, listSpec("number"), []);
        return <div className="audioWaveform">
            <Waveform
                color={"darkblue"}
                height={this._waveHeight}
                barWidth={0.1}
                pos={this.props.duration}
                duration={this.props.duration}
                peaks={audioBuckets.length === AudioWaveform.NUMBER_OF_BUCKETS ? audioBuckets : undefined}
                progressColor={"blue"} />
        </div>;
    }
}