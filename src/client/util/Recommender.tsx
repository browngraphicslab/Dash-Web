import React = require("react");
import { observer } from "mobx-react";
import { observable, runInAction } from "mobx";
var w2v = require('word2vec');

@observer
export default class Recommender extends React.Component {

    /***
     * Converts text to n-dimensional vector using pretrained word2vec model
     */
    text_to_vec(text: string) {

    }

    render() {
        return (
            <div>Recommender System!!!</div>
        )
    }

}