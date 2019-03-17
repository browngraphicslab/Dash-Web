import * as ReactDOM from 'react-dom'; 
import React = require('react');
import "./ImageUpload.scss"



const onPointerDown = (e: React.TouchEvent) => {
    let imgInput = document.getElementById("input_image_file"); 
    if (imgInput){
        imgInput.click(); 
    }
}

ReactDOM.render((
    <div className = "imgupload_cont">
        <button className = "button_file" onTouchStart = {onPointerDown}> Open Image </button>
        <input type= "file" accept = "image/*" capture="camera" className = "input_file" id = "input_image_file"></input>
        
    </div>),
    document.getElementById('root')
);