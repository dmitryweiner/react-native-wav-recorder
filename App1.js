import React, { Component } from 'react';
import { StyleSheet, View, Button, Text, Alert, ToastAndroid } from 'react-native';
import { Buffer } from 'buffer';
import Permissions from 'react-native-permissions';
import Sound from 'react-native-sound';
import AudioRecord from 'react-native-audio-record';
import moment from 'moment';
const RNFS = require('react-native-fs'); // WTF???

const STATE_INITIAL = 0;
const STATE_RECORDING = 1;
const STATE_LOADED = 2;
const STATE_PLAYING = 3;
const STATE_PAUSED = 4;

export default class App extends Component {
  sound = null;
  dir = `${RNFS.ExternalStorageDirectoryPath}/WavRecorder`;
  state = {
    audioFile: '',
    appState: STATE_INITIAL
  };

  async componentDidMount() {
    await this.checkPermissions();
    await this.prepareDir();

    const options = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      wavFile: 'test.wav'
    };

    await AudioRecord.init(options);
    await AudioRecord.start();
    await AudioRecord.stop();

    /*AudioRecord.on('data', data => {
      const chunk = Buffer.from(data, 'base64');
      //console.log('chunk size', chunk.byteLength);
      // do something with audio chunk
    });*/
  }

  checkPermissions = async () => {
    try {
      console.log('permission check');
      const p = await Permissions.checkMultiple(['microphone', 'storage']);
      console.log('permission check result', p);
      if (p !== 'authorized') {
        console.log('Requesting permissions');
        return this.requestPermissions();
      }
    } catch (err) {
      Alert.alert('Error', 'Error requesting permissions');
      console.warn('Error checking permissions', err);
      return false;
    }
  };

  requestPermissions = async () => {
    await Permissions.request('microphone');
    await Permissions.request('storage');
  };

  prepareDir = async () => {
    const dirPath = `${this.dir}`;
    try {
      const isExists = await RNFS.exists(dirPath);
      if (!isExists) {
        console.log('Creating directory', dirPath);
        await RNFS.mkdir(dirPath);
      }
    } catch (err) {
      Alert.alert('Error', `Error creating directory ${dirPath}: ${err.message}`);
      console.warn(`Error creating directory ${dirPath}`, err);
    }
  };

  start = () => {
    console.log('start record');
    this.setState({
      audioFile: '',
      appState: STATE_RECORDING,
      isFileSaved: false
    });
    AudioRecord.start();
  };

  stop = async () => {
    if (this.state.appState !== STATE_RECORDING) return;
    console.log('stop record');
    let audioFile = await AudioRecord.stop();
    console.log('audioFile', audioFile);
    const isExists = await RNFS.exists(audioFile);
    if (isExists) {
      await this.saveFile(audioFile);
    }
    this.setState({
      audioFile,
      appState: STATE_INITIAL
    });
  };

  load = () => {
    return new Promise((resolve, reject) => {
      if (!this.state.audioFile) {
        return reject('file path is empty');
      }

      this.sound = new Sound(this.state.audioFile, '', error => {
        if (error) {
          console.log('failed to load the file', error);
          return reject(error);
        }
        this.setState({ appState: STATE_LOADED });
        return resolve();
      });
    });
  };

  play = async () => {
    if (this.appState !== STATE_LOADED) {
      try {
        await this.load();
      } catch (error) {
        console.log(error);
      }
    }

    this.setState({ appState: STATE_PLAYING });
    Sound.setCategory('Playback');

    this.sound.play(success => {
      if (success) {
        console.log('successfully finished playing');
      } else {
        console.log('playback failed due to audio decoding errors');
      }
      this.setState({ appState: STATE_PAUSED });
      // this.sound.release();
    });
  };

  pause = () => {
    this.sound.pause();
    this.setState({ appState: STATE_PAUSED });
  };

  saveFile = async (temporaryFileName) => {
    const newFilename = `${this.dir}/${moment().format('YYYY-MM-DD-HH-mm-ss')}.wav`;
    console.log('Trying to move file', temporaryFileName, newFilename);
    try {
      await RNFS.copyFile(temporaryFileName, newFilename);
      ToastAndroid.show('New file saved here: ' + newFilename, ToastAndroid.SHORT);
    } catch (err) {
      Alert.alert('Error', `Error saving file ${newFilename}: ${err.message}`);
      console.warn(`Error saving file ${newFilename}`, err);
    }
  };

  render() {
    const { appState, audioFile } = this.state;
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Button onPress={this.start} title="Record" disabled={[STATE_RECORDING, STATE_PLAYING].includes(appState)} />
          <Button onPress={this.stop} title="Stop" disabled={appState !== STATE_RECORDING} />
          {appState !== STATE_PLAYING ? (
            <Button onPress={this.play} title="Play" disabled={!audioFile} />
          ) : (
            <Button onPress={this.pause} title="Pause" disabled={!audioFile} />
          )}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center'
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly'
  }
});
